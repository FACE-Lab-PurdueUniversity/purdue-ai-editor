"""
Modal serverless function for streaming AI responses with budget tracking.
Model-agnostic implementation supporting multiple providers.
"""

import modal
import json
import os
import sys
from typing import AsyncIterator

# Add /root to Python path so imports work
sys.path.insert(0, "/root")

from budget_manager import (
    verify_auth_and_get_access_level,
    check_budget,
    log_usage,
    calculate_cost,
    get_model_config,
)

# Create Modal app
app = modal.App("coderobots-chat-budget")

# Define the image with dependencies
image = (
    modal.Image.debian_slim()
    .pip_install(
        "pydantic>=2.0.0",
        "openai",
        "anthropic",
        "google-genai",
        "supabase",
        "pytz",
        "fastapi[standard]",
        "aiohttp",
    )
    .add_local_dir("modal_functions/providers", "/root/providers")
    .add_local_file("modal_functions/budget_manager.py", "/root/budget_manager.py")
)


def get_provider(provider_name: str):
    """Get provider instance based on provider name."""
    if provider_name == "openai":
        print("Using OpenAI provider")
        from providers.openai_provider import OpenAIProvider
        return OpenAIProvider()
    elif provider_name == "skolegpt":
        print("Using SkoleGPT provider")
        from providers.skolegpt_provider import SkoleGPTProvider
        return SkoleGPTProvider()
    elif provider_name == "anthropic":
        print("Using Anthropic provider")
        from providers.anthropic_provider import AnthropicProvider
        return AnthropicProvider()
    elif provider_name == "google":
        print("Using Google provider")
        from providers.google_provider import GoogleProvider
        return GoogleProvider()
    else:
        raise ValueError(f"Unknown provider: {provider_name}")


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-api-key"),
        modal.Secret.from_name("anthropic-secret"),
        modal.Secret.from_name("gemini-secret"),
        modal.Secret.from_name("supabase-credentials"),
    ],
    timeout=300,  # 5 minute timeout
)
async def stream_chat_completion_with_budget(
    messages: list[dict],
    user_id: str,
    auth_token: str,
    model: str = "gpt-5-nano",
    max_tokens: int = 64000,
) -> AsyncIterator[str]:
    """
    Stream AI responses with budget tracking and enforcement.

    Args:
        messages: List of message dicts with 'role' and 'content'
        user_id: Supabase user ID
        auth_token: Supabase auth token for verification
        model: Model name (e.g., 'gpt-5-nano', 'skolegpt-v3')
        max_tokens: Maximum tokens to generate

    Yields:
        JSON-formatted chunks for SSE streaming
    """
    from supabase import create_client

    supabase_client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    
    usage_data = None
    
    try:
        # Look up model config (provider, pricing, flags) from the database
        model_cfg = await get_model_config(supabase_client, model)
        provider_name = model_cfg["provider"]
        should_stream = model_cfg["streamable"]
        
        # Verify authentication and get access level
        access_level = await verify_auth_and_get_access_level(
            supabase_client, user_id, auth_token
        )
        
        # Check budget (skolegpt bypasses this)
        await check_budget(supabase_client, user_id, access_level, model, provider_name)
        
        # Get provider instance
        provider = get_provider(provider_name)
        
        # Stream response from provider
        async for event in provider.stream_chat_completion(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
            stream=should_stream,
        ):
            if event["type"] == "content":
                # Stream content chunks
                data = json.dumps({
                    "type": "content",
                    "content": event["content"]
                })
                yield f"data: {data}\n\n"
            elif event["type"] == "usage":
                # Capture usage data (only OpenAI provides this)
                usage_data = event["usage"]
        
        # Log usage and calculate cost for all providers that return usage data
        if usage_data:
            try:
                cost = await calculate_cost(
                    supabase_client,
                    model,
                    provider_name,
                    usage_data['input_tokens'],
                    usage_data['output_tokens'],
                    usage_data['cached_input_tokens'],
                    usage_data['reasoning_tokens']
                )
                
                # Log usage to database
                await log_usage(
                    supabase_client,
                    user_id,
                    model,
                    usage_data['input_tokens'],
                    usage_data['output_tokens'],
                    usage_data['cached_input_tokens'],
                    usage_data['reasoning_tokens'],
                    cost
                )
                
                # Send usage info
                usage_info = {
                    "type": "usage_logged",
                    "model": model,
                    "usage": usage_data,
                    "cost": cost
                }
                yield f"data: {json.dumps(usage_info)}\n\n"
            except Exception as e:
                print(f"Error logging usage: {str(e)}")
                # Don't fail the request if logging fails
        
        # Send completion signal
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    except Exception as e:
        # Send error message
        error_data = json.dumps({
            "type": "error",
            "error": str(e)
        })
        yield f"data: {error_data}\n\n"


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-api-key"),
        modal.Secret.from_name("anthropic-secret"),
        modal.Secret.from_name("gemini-secret"),
        modal.Secret.from_name("supabase-credentials"),
        modal.Secret.from_name("skolegpt-credentials"),
    ],
)
@modal.fastapi_endpoint(method="POST")
async def chat_endpoint_with_budget(request: dict):
    """
    HTTP endpoint for chat requests with budget tracking.

    Expected payload:
    {
        "messages": [{"role": "system|user|assistant", "content": "..."}],
        "user_id": "uuid",
        "auth_token": "jwt_token",
        "model": "gpt-5-nano",
        "max_tokens": 64000
    }
    """
    from fastapi.responses import StreamingResponse

    # Extract parameters
    messages = request.get("messages", [])
    user_id = request.get("user_id")
    auth_token = request.get("auth_token")
    model = request.get("model", "gpt-5-nano")
    max_tokens = request.get("max_tokens", 64000)

    if not messages:
        return {"error": "No messages provided"}, 400

    if not user_id or not auth_token:
        return {"error": "Missing authentication"}, 401

    # Return streaming response
    return StreamingResponse(
        stream_chat_completion_with_budget.remote_gen(
            messages=messages,
            user_id=user_id,
            auth_token=auth_token,
            model=model,
            max_tokens=max_tokens,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )

