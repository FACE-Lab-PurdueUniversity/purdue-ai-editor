"""
Modal serverless function for structured code analysis using OpenAI Structured Outputs.
Accepts code, a model name, and a JSON schema, and returns a structured JSON response.

TODO: move to Bill's circuit wiring repo potentially??
"""

import modal
import json
import os
import sys

sys.path.insert(0, "/root")

# Create Modal app
app = modal.App("coderobots-structured-code-analysis")

# Define the image with dependencies
image = (
    modal.Image.debian_slim()
    .pip_install(
        "openai",
        "fastapi[standard]",
    )
)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-api-key"),
    ],
    timeout=150,
)
async def analyze_code_structured(
    code: str,
    model: str,
    json_schema: dict,
    instructions: str,
) -> dict:
    """
    Analyze code using OpenAI Structured Outputs.

    Args:
        code: The source code string to analyze
        model: OpenAI model name (e.g. 'gpt-5-nano')
        json_schema: JSON Schema dict describing the desired response structure
        instructions: System prompt describing how to analyze the code

    Returns:
        dict with keys:
            "result": the parsed structured output (dict), or None if refused
            "usage": token usage info dict
    """
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    response = await client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": instructions},
            {"role": "user", "content": code},
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "structured_response",
                "schema": json_schema,
                "strict": True,
            }
        },
    )

    usage = response.usage

    usage_data = {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "total_tokens": usage.total_tokens,
    }

    result = json.loads(response.output_text) if response.output_text else None

    return {
        "result": result,
        "usage": usage_data,
    }


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("openai-api-key"),
    ],
    timeout=150,
)
@modal.fastapi_endpoint(method="POST")
async def structured_code_analysis_endpoint(request: dict):
    """
    HTTP endpoint for structured code analysis.

    Expected payload:
    {
        "code": "def foo(): ...",
        "model": "gpt-5-nano",
        "json_schema": { "type": "object", "components": { ... }, ... },
        "instructions": "System prompt describing how to analyze the code."
    }

    Returns:
    {
        "result": { ... },   // parsed structured output, or null if refused
        "usage": { "input_tokens": 0, "output_tokens": 0, "total_tokens": 0 }
    }
    """
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse

    code = request.get("code")
    model = request.get("model")
    json_schema = request.get("json_schema")
    instructions = request.get("instructions")

    if not code:
        raise HTTPException(status_code=400, detail="Missing required field: code")
    if not model:
        raise HTTPException(status_code=400, detail="Missing required field: model")
    if not json_schema:
        raise HTTPException(status_code=400, detail="Missing required field: json_schema")
    if not instructions:
        raise HTTPException(status_code=400, detail="Missing required field: instructions")

    kwargs = dict(
        code=code, 
        model=model, 
        json_schema=json_schema, 
        instructions=instructions
    )

    result = await analyze_code_structured.remote.aio(**kwargs)

    return JSONResponse(
        content=result,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )
