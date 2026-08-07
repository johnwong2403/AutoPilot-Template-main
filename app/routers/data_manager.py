"""
data_manager.py

FastAPI routes for the Data Manager surface: a live registry of every
connected system, what it's used for, and whether it's currently
healthy.
"""

from fastapi import APIRouter, HTTPException

from app.services.integrations_health import get_all_integration_statuses

router = APIRouter()


@router.get("/status")
async def get_data_manager_status():
    """
    Runs a real, read-only health check against every connected system
    (Supabase, Slack, Typeform, Supervity Auto) and returns their live
    status. No cached or hardcoded values.
    """
    try:
        integrations = await get_all_integration_statuses()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {e}")

    healthy_count = sum(1 for i in integrations if i["status"] == "healthy")
    return {
        "integrations": integrations,
        "summary": {
            "total": len(integrations),
            "healthy": healthy_count,
            "unhealthy": len(integrations) - healthy_count,
        },
    }