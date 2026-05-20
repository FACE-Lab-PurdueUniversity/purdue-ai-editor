"""
OpenAI Provider - implements OpenAI Responses API.
"""

import json
import os
from typing import AsyncIterator, Dict, Any
from openai import AsyncOpenAI
from .base_provider import BaseProvider


class OpenAIProvider(BaseProvider):
    """OpenAI provider implementation."""
    
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    
    async def stream_chat_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        stream: bool = True,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream chat completion from OpenAI."""
        # Convert messages to new Responses API format
        instructions = None
        input_messages = []
        
        for msg in messages:
            if msg["role"] == "system":
                # Combine system messages into instructions
                if instructions is None:
                    instructions = msg["content"]
                else:
                    instructions += "\n\n" + msg["content"]
            else:
                # Convert user/assistant messages to input format
                input_messages.append({
                    "type": "message",
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # Build request parameters
        request_params = {
            "model": model,
            "input": input_messages,
            "max_output_tokens": max_tokens,
            "stream": stream,
            "reasoning": {
                "effort": "low"
            },
            "text": {
                "format": {
                    "type": "text"
                }
            }
        }
        
        # Add instructions if system messages were present
        if instructions:
            request_params["instructions"] = instructions
        
        # Create response
        response = await self.client.responses.create(**request_params)
        
        usage_data = None
        
        if stream:
            # Handle streaming response
            async for event in response:
                if hasattr(event, 'type'):
                    # Handle text delta events
                    if event.type == "response.output_text.delta":
                        if hasattr(event, 'delta') and event.delta:
                            yield {
                                "type": "content",
                                "content": event.delta
                            }
                    
                    # Capture usage data from completion event
                    elif event.type == "response.completed":
                        if hasattr(event, 'response') and hasattr(event.response, 'usage'):
                            usage = event.response.usage
                            cached_tokens = 0
                            if hasattr(usage, 'input_tokens_details'):
                                cached_tokens = getattr(usage.input_tokens_details, 'cached_tokens', 0)
                            
                            reasoning_tokens = 0
                            if hasattr(usage, 'output_tokens_details'):
                                reasoning_tokens = getattr(usage.output_tokens_details, 'reasoning_tokens', 0)
                            
                            usage_data = {
                                'input_tokens': getattr(usage, 'input_tokens', 0),
                                'output_tokens': getattr(usage, 'output_tokens', 0),
                                'cached_input_tokens': cached_tokens,
                                'reasoning_tokens': reasoning_tokens,
                            }
        else:
            # Handle non-streaming response
            full_content = ""
            if hasattr(response, 'output') and response.output:
                for item in response.output:
                    if hasattr(item, 'content') and item.content:
                        for content_item in item.content:
                            if hasattr(content_item, 'text'):
                                full_content += content_item.text
            
            # Send the full content
            if full_content:
                yield {
                    "type": "content",
                    "content": full_content
                }
            
            # Extract usage data
            if hasattr(response, 'usage'):
                usage = response.usage
                cached_tokens = 0
                if hasattr(usage, 'input_tokens_details'):
                    cached_tokens = getattr(usage.input_tokens_details, 'cached_tokens', 0)
                
                reasoning_tokens = 0
                if hasattr(usage, 'output_tokens_details'):
                    reasoning_tokens = getattr(usage.output_tokens_details, 'reasoning_tokens', 0)
                
                usage_data = {
                    'input_tokens': getattr(usage, 'input_tokens', 0),
                    'output_tokens': getattr(usage, 'output_tokens', 0),
                    'cached_input_tokens': cached_tokens,
                    'reasoning_tokens': reasoning_tokens,
                }
        
        # Yield usage data if available
        if usage_data:
            yield {
                "type": "usage",
                "usage": usage_data
            }
    
