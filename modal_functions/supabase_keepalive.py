"""
Modal cron job that inserts and deletes a heartbeat row in Supabase
to generate clear database activity and prevent idle pausing.
"""

import os
import uuid
from datetime import datetime, timezone

import modal


app = modal.App("coderobots-supabase-keepalive")

image = modal.Image.debian_slim().pip_install("supabase")


@app.function(
    image=image,
    schedule=modal.Cron("0 0 * * *", timezone="UTC"),
    secrets=[modal.Secret.from_name("supabase-credentials")],
    timeout=60,
)
def ping_supabase_keepalive() -> dict:
    """
    Insert a heartbeat row, then delete it, so the database receives
    explicit write and delete operations on every run.
    """
    from supabase import create_client

    supabase_client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    heartbeat_key = f"system.supabase_keepalive.{uuid.uuid4()}"
    heartbeat_value = {
        "source": "modal-cron",
        "status": "ok",
        "purpose": "prevent_free_tier_pause",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Insert
    insert_response = (
        supabase_client.table("app_config")
        .insert({"key": heartbeat_key, "value": heartbeat_value})
        .execute()
    )
    print(f"Insert response: {insert_response}")
    inserted_rows = len(insert_response.data) if insert_response.data else 0

    # Delete
    delete_response = (
        supabase_client.table("app_config")
        .delete()
        .eq("key", heartbeat_key)
        .execute()
    )
    print(f"Delete response: {delete_response}")
    deleted_rows = len(delete_response.data) if delete_response.data else 0

    print(f"Keepalive cycle completed for key: {heartbeat_key}")
    return {
        "success": True,
        "key": heartbeat_key,
        "inserted_rows": inserted_rows,
        "deleted_rows": deleted_rows,
    }


@app.local_entrypoint()
def main():
    result = ping_supabase_keepalive.remote()
    print(result)