"""
Anthropic Provider - implements Anthropic Messages API.
"""

import os
from typing import AsyncIterator, Dict, Any
import anthropic
from .base_provider import BaseProvider


class AnthropicProvider(BaseProvider):
    """Anthropic provider implementation."""

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    async def stream_chat_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        stream: bool = True,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream chat completion from Anthropic."""
        # Separate system messages from user/assistant messages
        system_parts = []
        input_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system_parts.append(msg["content"])
            else:
                input_messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                })

        system_prompt = "\n\n".join(system_parts) if system_parts else anthropic.NOT_GIVEN

        if stream:
            async with self.client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=input_messages,
            ) as s:
                async for text in s.text_stream:
                    yield {"type": "content", "content": text}

                final = await s.get_final_message()
                usage = final.usage
                yield {
                    "type": "usage",
                    "usage": {
                        "input_tokens": usage.input_tokens,
                        "output_tokens": usage.output_tokens,
                        "cached_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
                        "reasoning_tokens": 0,
                    },
                }
        else:
            response = await self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=input_messages,
            )

            full_content = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            if full_content:
                yield {"type": "content", "content": full_content}

            usage = response.usage
            yield {
                "type": "usage",
                "usage": {
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "cached_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
                    "reasoning_tokens": 0,
                },
            }
