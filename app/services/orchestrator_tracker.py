"""
orchestrator_tracker.py

Runs the Auto Orchestrator in the background (fire-and-forget) and keeps
Supabase updated with progress, so the Dashboard can poll for the latest
state no matter which page the person is on — instead of the request
blocking until the whole run (including any human-review pause) finishes.
"""

from datetime import datetime, timezone
from typing import Any

from app.services.supabase_client import (
    create_orchestrator_run,
    update_orchestrator_run,
    fetch_latest_onboarding_snapshot,
)
from app.services.policy_engine import evaluate_policies_for_context
from app.services.supervity_client import trigger_orchestrator_stream, SupervityAPIError


def _days_since(date_str: str | None) -> int | None:
    if not date_str:
        return None
    try:
        then = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    return (now - then).days


async def start_new_run() -> dict:
    """Creates the Supabase row immediately so the caller can respond
    to the frontend right away, before the Auto run has even started."""
    return create_orchestrator_run()


async def run_and_track(run_id: str) -> None:
    """
    The actual background coroutine. Streams the Orchestrator run and
    updates the Supabase row as progress comes in. If the run pauses
    for human review in Auto, this coroutine simply keeps waiting on
    the stream — the Supabase row stays at status "running" the whole
    time, which is what the Dashboard polls and displays.
    """
    activity_runs: list[dict[str, Any]] = []
    workflow_id: str | None = None

    try:
        async for event in trigger_orchestrator_stream():
            event_name = event.get("event")
            data = event.get("data")

            if not isinstance(data, dict):
                continue

            if event_name in ("activity-run", "workflow-run"):
                step = data.get("activityRun") if isinstance(data.get("activityRun"), dict) else data
                if isinstance(step, dict) and step.get("stepName"):
                    existing = next(
                        (a for a in activity_runs if a.get("id") == step.get("id")), None
                    )
                    if existing:
                        existing.update(step)
                    else:
                        activity_runs.append(step)

                wf_id = data.get("workflowId") or (data.get("workflowRun") or {}).get("workflowId")
                if wf_id:
                    workflow_id = wf_id

                update_orchestrator_run(
                    run_id,
                    {
                        "workflow_id": workflow_id,
                        "status": "running",
                        "activity_runs": activity_runs,
                    },
                )

            elif event_name == "result":
                result_payload = data.get("workflowRun") if isinstance(data, dict) else None
                final_activity_runs = (result_payload or {}).get("activityRuns") or activity_runs
                final_workflow_id = (result_payload or {}).get("workflowId") or workflow_id

                snapshot = fetch_latest_onboarding_snapshot()
                policy_results: list[dict[str, Any]] = []
                if snapshot.get("status") == "ok":
                    hire_date = (snapshot.get("worker") or {}).get("Hire_Date")
                    hire_days = _days_since(hire_date)
                    context = {
                        "employee_id": (snapshot.get("latest_task") or {}).get("Employee_ID")
                        or (snapshot.get("worker") or {}).get("Employee_ID"),
                        "risk_score": 50,
                        "days_since_hire": hire_days,
                        "pulse_survey_missing": True,
                        "is_new_hire": hire_days <= 90 if hire_days is not None else True,
                    }
                    policy_results = evaluate_policies_for_context(context)

                update_orchestrator_run(
                    run_id,
                    {
                        "workflow_id": final_workflow_id,
                        "status": "completed",
                        "activity_runs": final_activity_runs,
                        "policy_results": policy_results,
                    },
                )
                return

            elif event_name == "error":
                update_orchestrator_run(
                    run_id,
                    {"status": "error", "activity_runs": activity_runs},
                )
                return

        # Stream ended without an explicit result/error frame.
        update_orchestrator_run(
            run_id,
            {"status": "completed", "activity_runs": activity_runs},
        )

    except SupervityAPIError:
        update_orchestrator_run(run_id, {"status": "error", "activity_runs": activity_runs})
    except Exception:
        update_orchestrator_run(run_id, {"status": "error", "activity_runs": activity_runs})