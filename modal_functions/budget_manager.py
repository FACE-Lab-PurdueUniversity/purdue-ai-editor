"""
Budget Manager - Model-agnostic budget tracking and usage logging.
Handles budget checks, usage logging, and cost calculation for OpenAI models.
"""

import os
from datetime import datetime, timezone, timedelta
import pytz
from typing import Optional, Dict, Any


# Budget configuration (in USD per day)
CAMPS_DAILY_BUDGET = float(os.environ.get("CAMPS_DAILY_BUDGET", "0.50"))
STANDARD_DAILY_BUDGET = float(os.environ.get("STANDARD_DAILY_BUDGET", "0.125"))


def get_day_boundaries_et():
    """Get the start and end of the current day in Eastern Time."""
    et_tz = pytz.timezone('US/Eastern')
    now_et = datetime.now(et_tz)

    day_start = now_et.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    return day_start, day_end


async def verify_auth_and_get_access_level(supabase_client, user_id: str, auth_token: str):
    """Verify the auth token and get user's access level."""
    try:
        # Verify the user exists and token is valid
        user = supabase_client.auth.get_user(auth_token)
        
        if not user or user.user.id != user_id:
            raise ValueError("Invalid authentication")
        
        # Get access level from user metadata
        access_level = user.user.user_metadata.get('access_level', 'standard')
        
        return access_level
    except Exception as e:
        raise ValueError(f"Authentication failed: {str(e)}")


async def get_daily_spend(supabase_client, user_id: str):
    """Get total spend for the current day."""
    day_start, day_end = get_day_boundaries_et()
    
    # Query ai_usage table with service role to bypass RLS
    result = supabase_client.table('ai_usage') \
        .select('cost_usd') \
        .eq('user_id', user_id) \
        .gte('timestamp', day_start.isoformat()) \
        .lt('timestamp', day_end.isoformat()) \
        .execute()
    
    total_spend = sum(row['cost_usd'] for row in result.data)
    return float(total_spend)


async def get_model_config(supabase_client, model: str, provider: str = None) -> Dict[str, Any]:
    """Fetch model config (provider, pricing, flags) from ai_models."""
    query = supabase_client.table('ai_models') \
        .select('provider,input_price,cached_input_price,output_price,unlimited,streamable') \
        .eq('model_name', model)

    if provider:
        query = query.eq('provider', provider)

    result = query.limit(1).execute()

    if not result.data:
        raise ValueError(f"Unknown model: {model}")

    config = result.data[0]
    return {
        "provider": config["provider"],
        "input_price": float(config["input_price"]),
        "cached_input_price": float(config["cached_input_price"]) if config.get("cached_input_price") is not None else float(config["input_price"]),
        "output_price": float(config["output_price"]),
        "unlimited": bool(config.get("unlimited", False)),
        "streamable": bool(config.get("streamable", True)),
    }


async def calculate_cost(
    supabase_client,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int,
    reasoning_tokens: int,
) -> float:
    """Calculate cost in USD based on ai_models pricing (per 1M tokens)."""
    pricing = await get_model_config(supabase_client, model, provider)
    
    # Calculate costs (divide by 1M since pricing is per 1M tokens)
    regular_input_cost = (input_tokens - cached_input_tokens) * pricing["input_price"] / 1_000_000
    cached_cost = cached_input_tokens * pricing["cached_input_price"] / 1_000_000
    output_cost = output_tokens * pricing["output_price"] / 1_000_000

    # Reasoning tokens are charged at output rate
    reasoning_cost = reasoning_tokens * pricing["output_price"] / 1_000_000
    
    total_cost = regular_input_cost + cached_cost + output_cost + reasoning_cost
    return round(total_cost, 6)


async def log_usage(supabase_client, user_id: str, model: str, 
                   input_tokens: int, output_tokens: int, 
                   cached_input_tokens: int, reasoning_tokens: int, cost: float):
    """Log usage to the ai_usage table."""
    try:
        print(f"Logging usage: {user_id}, {model}, {input_tokens}, {output_tokens}, {cached_input_tokens}, {reasoning_tokens}, {cost}")
        supabase_client.table('ai_usage').insert({
            'user_id': user_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'model': model,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'cached_input_tokens': cached_input_tokens,
            'reasoning_tokens': reasoning_tokens,
            'cost_usd': cost,
        }).execute()
    except Exception as e:
        print(f"Error logging usage: {str(e)}")
        raise


async def check_budget(supabase_client, user_id: str, access_level: str, model: str, provider: str):
    """
    Check if user has budget remaining for the request.
    
    Returns:
        bool: True if request should proceed, otherwise raises an error
    """
    
    if access_level == 'standard':
        daily_spend = await get_daily_spend(supabase_client, user_id)
        if daily_spend >= STANDARD_DAILY_BUDGET:
            raise ValueError("User has exceeded their budget")
    elif access_level == 'camps':
        model_config = await get_model_config(supabase_client, model, provider)
        if not model_config["unlimited"]:
            daily_spend = await get_daily_spend(supabase_client, user_id)
            if daily_spend >= CAMPS_DAILY_BUDGET:
                raise ValueError("User has exceeded their budget")
    else:
        raise ValueError("Invalid access level")
    
    return True

