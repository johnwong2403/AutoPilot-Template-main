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
    fetch_employee_snapshot,
    compute_employee_risk_score,
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


async def start_new_run(employee_id: str | None = None) -> dict:
    """Creates the Supabase row immediately so the caller can respond
    to the frontend right away, before the Auto run has even started.

    If employee_id is provided, this run will process that specific
    employee instead of the front of the queue.
    """
    return create_orchestrator_run(employee_id=employee_id)


async def run_and_track(run_id: str, employee_id: str | None = None) -> None:
    """
    The actual background coroutine. Streams the Orchestrator run and
    updates the Supabase row as progress comes in. If the run pauses
    for human review in Auto, this coroutine simply keeps waiting on
    the stream — the Supabase row stays at status "running" the whole
    time, which is what the Dashboard polls and displays.

    If employee_id is given, it's forwarded to Auto as an extra input
    (see supervity_client.py) AND used for our own risk calculation —
    both sides need to agree on who's being processed.
    """
    activity_runs: list[dict[str, Any]] = []
    workflow_id: str | None = None

    try:
        async for event in trigger_orchestrator_stream(employee_id=employee_id):
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

                # Pick the data source: a specific employee if one was
                # requested, otherwise fall back to the front of the queue.
                if employee_id:
                    snapshot = fetch_employee_snapshot(employee_id)
                else:
                    snapshot = fetch_latest_onboarding_snapshot()

                policy_results: list[dict[str, Any]] = []
                if snapshot.get("status") == "ok":
                    hire_date = (snapshot.get("worker") or {}).get("Hire_Date")
                    hire_days = _days_since(hire_date)
                    resolved_employee_id = (
                        employee_id
                        or (snapshot.get("latest_task") or {}).get("Employee_ID")
                        or (snapshot.get("worker") or {}).get("Employee_ID")
                    )

                    if resolved_employee_id:
                        try:
                            risk_info = compute_employee_risk_score(resolved_employee_id)
                        except Exception:
                            # Fail safe: if the real calculation errors out for
                            # any reason, fall back to a neutral value rather
                            # than crashing the whole run.
                            risk_info = {"risk_score": 50, "pulse_survey_missing": True}
                    else:
                        risk_info = {"risk_score": 50, "pulse_survey_missing": True}

                    context = {
                        "employee_id": resolved_employee_id,
                        "risk_score": risk_info["risk_score"],
                        "days_since_hire": hire_days,
                        "pulse_survey_missing": risk_info["pulse_survey_missing"],
                        "is_new_hire": hire_days <= 90 if hire_days is not None else True,
                    }
                    policy_results = evaluate_policies_for_context(context)
                elif employee_id:
                    # An explicit employee_id was given but no data was
                    # found for it — surface this clearly instead of
                    # silently falling back, so the Dashboard can show a
                    # real "not found" message rather than pretending it
                    # worked.
                    update_orchestrator_run(
                        run_id,
                        {
                            "workflow_id": final_workflow_id,
                            "status": "error",
                            "activity_runs": final_activity_runs,
                            "error_message": f"No data found for employee '{employee_id}'.",
                        },
                    )
                    return

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