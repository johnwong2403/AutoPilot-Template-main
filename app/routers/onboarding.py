"""
onboarding.py

FastAPI routes for the Onboarding & Retention Command Center.
"""

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.supabase_client import (
    fetch_latest_onboarding_snapshot,
    fetch_employee_snapshot,
    fetch_latest_orchestrator_run,
    clear_orchestrator_runs,
    get_dashboard_stats,
)
from app.services.orchestrator_tracker import start_new_run, run_and_track

router = APIRouter()


class TriggerRequest(BaseModel):
    # Optional — if provided, this run processes that specific employee's
    # real data instead of the front of the queue. Left blank/omitted, the
    # behavior is unchanged from before.
    employee_id: str | None = None


@router.post("/trigger")
async def trigger_onboarding_run(body: TriggerRequest | None = None):
    employee_id = body.employee_id.strip() if body and body.employee_id else None

    try:
        run = await start_new_run(employee_id=employee_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to start run: {str(e)}")

    asyncio.create_task(run_and_track(run["id"], employee_id=employee_id))
    return run


@router.get("/latest")
async def get_latest_onboarding_snapshot():
    try:
        return fetch_latest_onboarding_snapshot()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to read Supabase: {str(e)}")


@router.get("/employee/{employee_id}")
async def get_employee_snapshot(employee_id: str):
    try:
        return fetch_employee_snapshot(employee_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to read Supabase: {str(e)}")


@router.get("/run-state")
async def get_run_state():
    try:
        return fetch_latest_orchestrator_run()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to read run state: {str(e)}")


@router.delete("/run-state")
async def reset_run_state():
    try:
        return clear_orchestrator_runs()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reset run state: {str(e)}")


@router.get("/dashboard-stats")
async def get_dashboard_statistics():
    """
    Real, computed dashboard metrics (employees processed today,
    operator steps run today vs yesterday, policies triggered today vs
    yesterday, pending escalations) — never hardcoded or fake.
    """
    try:
        return get_dashboard_stats()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to compute dashboard stats: {str(e)}")