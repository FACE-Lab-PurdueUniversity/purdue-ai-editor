"""
Google Provider - implements Google Gemini API using the google-genai SDK.
"""

import os
from typing import AsyncIterator, Dict, Any
from google import genai
from google.genai import types
from .base_provider import BaseProvider


class GoogleProvider(BaseProvider):
    """Google Gemini provider implementation."""

    def __init__(self):
        self.client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    async def stream_chat_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        stream: bool = True,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream chat completion from Google Gemini."""
        # Separate system messages; convert user/assistant to Gemini Content format
        system_parts = []
        contents = []

        for msg in messages:
            if msg["role"] == "system":
                system_parts.append(msg["content"])
            elif msg["role"] == "user":
                contents.append(types.Content(role="user", parts=[types.Part(text=msg["content"])]))
            elif msg["role"] == "assistant":
                # Gemini uses "model" instead of "assistant"
                contents.append(types.Content(role="model", parts=[types.Part(text=msg["content"])]))

        config = types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            system_instruction="\n\n".join(system_parts) if system_parts else None,
        )

        if stream:
            usage_metadata = None
            async for chunk in await self.client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=config,
            ):
                if chunk.text:
                    yield {"type": "content", "content": chunk.text}
                if chunk.usage_metadata:
                    usage_metadata = chunk.usage_metadata

            if usage_metadata:
                yield {
                    "type": "usage",
                    "usage": {
                        "input_tokens": usage_metadata.prompt_token_count or 0,
                        "output_tokens": usage_metadata.candidates_token_count or 0,
                        "cached_input_tokens": getattr(usage_metadata, "cached_content_token_count", 0) or 0,
                        "reasoning_tokens": 0,
                    },
                }
        else:
            response = await self.client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

            if response.text:
                yield {"type": "content", "content": response.text}

            usage = response.usage_metadata
            if usage:
                yield {
                    "type": "usage",
                    "usage": {
                        "input_tokens": usage.prompt_token_count or 0,
                        "output_tokens": usage.candidates_token_count or 0,
                        "cached_input_tokens": getattr(usage, "cached_content_token_count", 0) or 0,
                        "reasoning_tokens": 0,
                    },
                }
