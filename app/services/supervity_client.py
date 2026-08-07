"""
supervity_client.py

Client for calling Supervity Auto's Workflow API.
"""

import os
import json
import httpx
from typing import AsyncGenerator, Any


class SupervityAPIError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Supervity API error {status_code}: {detail}")


def _get_config() -> dict:
    return {
        "base_url": os.environ["SUPERVITY_API_BASE_URL"].rstrip("/"),
        "api_key": os.environ["SUPERVITY_API_KEY"],
        "workflow_id": os.environ["SUPERVITY_ORCHESTRATOR_WORKFLOW_ID"],
        "org_key": os.environ.get("SUPERVITY_ORG_KEY", ""),
        "timezone": os.environ.get("SUPERVITY_USER_TIMEZONE", "Asia/Kuala_Lumpur"),
        "supabase_url": os.environ["SUPABASE_URL"],
        "supabase_token": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    }


def _headers(api_key: str, org_key: str, timezone: str) -> dict:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "x-source": "external",
        "x-user-timezone": timezone,
    }
    if org_key:
        headers["x-active-org"] = org_key
    return headers


async def trigger_orchestrator_stream() -> AsyncGenerator[dict[str, Any], None]:
    """
    Triggers one run of the Orchestrator and yields each SSE event as it
    arrives. Each yielded dict has "event" (the SSE event name, e.g.
    "ping", "activity-run", "thinking", "result", "error") and "data"
    (the parsed JSON payload for that event).
    """
    config = _get_config()
    url = f"{config['base_url']}/workflow-runs/execute/stream"

    files = {
        "workflowId": (None, config["workflow_id"]),
        "inputs[supabase_url]": (None, config["supabase_url"]),
        "inputs[supabase_token]": (None, config["supabase_token"]),
    }

    timeout = httpx.Timeout(connect=15.0, read=180.0, write=30.0, pool=15.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            url,
            headers=_headers(config["api_key"], config["org_key"], config["timezone"]),
            files=files,
        ) as response:
            if response.status_code >= 400:
                body = await response.aread()
                raise SupervityAPIError(response.status_code, body.decode(errors="replace"))

            # SSE frames look like:
            #   event: result
            #   data: {"success": true, ...}
            #   <blank line>
            # We track the most recent "event:" line and pair it with the
            # "data:" line that follows it — the event name is NOT inside
            # the JSON payload, it's a separate SSE field.
            current_event = "message"  # SSE default event name if none given

            async for line in response.aiter_lines():
                if line == "":
                    # blank line = end of one SSE frame; reset for the next
                    current_event = "message"
                    continue

                if line.startswith("event:"):
                    current_event = line[len("event:"):].strip()
                    continue

                if line.startswith("data:"):
                    payload_line = line[len("data:"):].strip()
                    if not payload_line:
                        continue
                    try:
                        data = json.loads(payload_line)
                    except json.JSONDecodeError:
                        data = payload_line  # not JSON, pass through raw
                    yield {"event": current_event, "data": data}
                    continue

                # ignore other SSE fields (id:, retry:, comments starting with ':')


async def trigger_orchestrator_and_collect() -> dict[str, Any]:
    """
    Runs the Orchestrator and waits for the stream to finish, returning
    the "result" event's data (or "error" event's data) as the final
    outcome. Ignores keep-alive "ping" events and progress events
    ("activity-run", "workflow-run", "thinking") along the way.
    """
    last_event: dict[str, Any] = {}

    async for event in trigger_orchestrator_stream():
        event_name = event.get("event")
        data = event.get("data")

        if event_name == "result":
            return {"status": "completed", "result": data}

        if event_name == "error":
            raise SupervityAPIError(502, json.dumps(data) if isinstance(data, dict) else str(data))

        # Keep track of the most recent non-terminal event in case the
        # stream ends unexpectedly without a "result"/"error" frame.
        last_event = event

    if not last_event:
        raise SupervityAPIError(500, "Stream ended with no events received.")

    return {"status": "incomplete", "last_event": last_event}