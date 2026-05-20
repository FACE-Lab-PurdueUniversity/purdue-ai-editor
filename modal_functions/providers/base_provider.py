"""
Base Provider Interface - defines the contract for AI providers.
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, Any, Optional


class BaseProvider(ABC):
    """Abstract base class for AI providers."""
    
    @abstractmethod
    async def stream_chat_completion(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        stream: bool = True,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Stream chat completion from the provider.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name to use
            max_tokens: Maximum tokens to generate
            stream: Whether to stream the response
        
        Yields:
            Dict with 'type' and content:
            - {'type': 'content', 'content': '...'} for content chunks
            - {'type': 'usage', 'usage': {...}} for usage data (optional)
        """
        pass

