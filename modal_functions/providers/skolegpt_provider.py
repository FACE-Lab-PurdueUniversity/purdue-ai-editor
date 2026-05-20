"""
SkoleGPT Provider - implements SkoleGPT API.
"""

import json
import os
import logging
import aiohttp
from typing import AsyncIterator, Dict, Any
from .base_provider import BaseProvider

logger = logging.getLogger(__name__)


class SkoleGPTProvider(BaseProvider):
    """SkoleGPT provider implementation."""
    
    def __init__(self):
        self.api_url = os.environ.get("SKOLEGPT_API_URL")
        self.api_key = os.environ.get("SKOLEGPT_API_KEY")
        
        if not self.api_url or not self.api_key:
            raise ValueError("SKOLEGPT_API_URL and SKOLEGPT_API_KEY must be set")
    
    async def stream_chat_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        stream: bool = True,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream chat completion from SkoleGPT."""
        # Prepare messages for SkoleGPT API
        # SkoleGPT expects messages in OpenAI format
        api_messages = []
        for msg in messages:
            api_messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })
        
        # Build payload
        payload = {
            "messages": api_messages,
            "stream": stream,
            "model": model,
            "temperature": 0.7,
            "presence_penalty": 0,
            "frequency_penalty": 0,
            "top_p": 0.95,
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "text/event-stream" if stream else "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(self.api_url, json=payload, headers=headers) as response:
                if not response.ok:
                    raise ValueError(f"SkoleGPT API error: {response.status} - {await response.text()}")
                
                if stream:
                    # Handle SSE streaming
                    buffer = b''
                    async for chunk in response.content.iter_any():
                        buffer += chunk
                        
                        # Process complete lines
                        while b'\n' in buffer:
                            line_bytes, buffer = buffer.split(b'\n', 1)
                            line_str = line_bytes.decode('utf-8', errors='ignore').strip()
                            
                            if not line_str:
                                continue
                            
                            # Parse SSE format: "data: {json}\n\n"
                            if line_str.startswith('data: '):
                                data_str = line_str[6:]  # Remove "data: " prefix
                                
                                if data_str == '[DONE]':
                                    logger.debug("SkoleGPT stream: Received [DONE] marker")
                                    yield {"type": "done"}
                                    break
                                
                                try:
                                    data = json.loads(data_str)
                                                                        
                                    # Extract content from SkoleGPT response format
                                    # SkoleGPT uses OpenAI-compatible format with choices[].delta
                                    if 'choices' in data and len(data['choices']) > 0:
                                        choice = data['choices'][0]
                                        delta = choice.get('delta', {})
                                        finish_reason = choice.get('finish_reason')
                                                                                
                                        # Handle content delta
                                        if 'content' in delta and delta['content']:
                                            logger.debug(f"SkoleGPT content chunk: {repr(delta['content'])}")
                                            yield {
                                                "type": "content",
                                                "content": delta['content']
                                            }
                                        
                                        # Handle finish reason (stream complete)
                                        if finish_reason:
                                            logger.debug(f"SkoleGPT stream finished: finish_reason={finish_reason}")
                                            yield {"type": "done"}
                                            break
                                    else:
                                        logger.warning(f"SkoleGPT stream: Unexpected data structure (no choices): {data}")
                                        
                                except json.JSONDecodeError as e:
                                    logger.warning(f"SkoleGPT stream: Failed to parse JSON: {data_str[:100]}... Error: {e}")
                                    # Skip malformed JSON
                                    continue
                else:
                    # Handle non-streaming response
                    data = await response.json()
                    
                    # Debug: Log the raw data structure
                    logger.debug(f"SkoleGPT non-streaming response: {json.dumps(data, indent=2)}")
                    
                    # Extract content from SkoleGPT response format
                    # SkoleGPT uses OpenAI-compatible format
                    if 'choices' in data and len(data['choices']) > 0:
                        choice = data['choices'][0]
                        content = choice.get('message', {}).get('content', '')
                        logger.debug(f"SkoleGPT non-streaming content: {repr(content[:100]) if content else 'None'}...")
                        if content:
                            yield {
                                "type": "content",
                                "content": content
                            }
                    else:
                        logger.warning(f"SkoleGPT non-streaming: Unexpected data structure (no choices): {data}")
        
        # SkoleGPT doesn't provide usage data, so we don't yield usage

