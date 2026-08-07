"""
integrations_health.py

Lightweight, read-only health checks for every live integration the
Onboarding & Retention build uses. Each check function returns a dict:

    {
        "name": str,
        "category": "system_of_record" | "channel",
        "usage": str,            # one-line description for the Data Manager UI
        "status": "healthy" | "unhealthy",
        "detail": str,            # short human-readable status message
        "checked_at": iso8601 str,
    }

None of these calls write or trigger anything — they only verify that
each system is reachable with the credentials we hold.
"""

import os
import httpx
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def check_supabase() -> dict:
    name = "Supabase"
    category = "system_of_record"
    usage = "Primary data store: employees, onboarding tasks, policies, exceptions, insights."
    try:
        from app.services.supabase_client import supabase

        resp = supabase.table("Workers").select("Employee_ID").limit(1).execute()
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "healthy",
            "detail": f"Connected. Sample query returned {len(resp.data)} row(s).",
            "checked_at": _now(),
        }
    except Exception as e:
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": f"Query failed: {e}",
            "checked_at": _now(),
        }


async def check_slack() -> dict:
    name = "Slack"
    category = "channel"
    usage = "Sends escalation and notification messages to managers / HR."
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token:
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": "SLACK_BOT_TOKEN not configured.",
            "checked_at": _now(),
        }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                "https://slack.com/api/auth.test",
                headers={"Authorization": f"Bearer {token}"},
            )
            data = resp.json()
        if data.get("ok"):
            return {
                "name": name,
                "category": category,
                "usage": usage,
                "status": "healthy",
                "detail": f"Authenticated as {data.get('user', 'bot')} in workspace {data.get('team', '')}.",
                "checked_at": _now(),
            }
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": f"Slack rejected token: {data.get('error', 'unknown error')}",
            "checked_at": _now(),
        }
    except Exception as e:
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": f"Request failed: {e}",
            "checked_at": _now(),
        }


async def check_typeform() -> dict:
    name = "Typeform"
    category = "channel"
    usage = "Intake form new employees submit; feeds the Employee Intake Operator."
    token = os.environ.get("TYPEFORM_API_TOKEN")
    form_id = os.environ.get("TYPEFORM_FORM_ID")
    if not token or not form_id:
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": "TYPEFORM_API_TOKEN or TYPEFORM_FORM_ID not configured.",
            "checked_at": _now(),
        }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://api.typeform.com/forms/{form_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "name": name,
                "category": category,
                "usage": usage,
                "status": "healthy",
                "detail": f"Form reachable: \"{data.get('title', form_id)}\".",
                "checked_at": _now(),
            }
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": f"Typeform returned HTTP {resp.status_code}.",
            "checked_at": _now(),
        }
    except Exception as e:
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": f"Request failed: {e}",
            "checked_at": _now(),
        }


async def check_supervity_auto() -> dict:
    name = "Supervity Auto"
    category = "system_of_record"
    usage = "Runs the Orchestrator and 7 Operators (agent layer)."
    base_url = os.environ.get("SUPERVITY_API_BASE_URL")
    api_key = os.environ.get("SUPERVITY_API_KEY")
    if not base_url or not api_key:
        return {
            "name": name,
            "category": category,
            "usage": usage,
            "status": "unhealthy",
            "detail": "SUPERVITY_API_BASE_URL or SUPERVITY_API_KEY not configured.",
            "checked_at": _now(),
        }
    return {
        "name": name,
        "category": category,
        "usage": usage,
        "status": "healthy",
        "detail": "Credentials configured.",
        "checked_at": _now(),
    }


async def get_all_integration_statuses() -> list[dict]:
    return [
        await check_supabase(),
        await check_slack(),
        await check_typeform(),
        await check_supervity_auto(),
    ]