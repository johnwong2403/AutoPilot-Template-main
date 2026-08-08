import os
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


# ---------- Onboarding snapshot ----------

def fetch_latest_onboarding_snapshot():
    task_resp = (
        supabase.table("Onboarding_Tasks")
        .select("*")
        .limit(1)
        .execute()
    )

    if not task_resp.data:
        return {"status": "empty", "message": "No onboarding tasks found yet."}

    latest_task = task_resp.data[0]
    employee_id = latest_task.get("Employee_ID")

    worker = None
    if employee_id:
        worker_resp = (
            supabase.table("Workers")
            .select("*")
            .eq("Employee_ID", employee_id)
            .limit(1)
            .execute()
        )
        if worker_resp.data:
            worker = worker_resp.data[0]

    return {"status": "ok", "latest_task": latest_task, "worker": worker}


def fetch_employee_snapshot(employee_id: str):
    worker_resp = (
        supabase.table("Workers")
        .select("*")
        .eq("Employee_ID", employee_id)
        .limit(1)
        .execute()
    )
    worker = worker_resp.data[0] if worker_resp.data else None

    task_resp = (
        supabase.table("Onboarding_Tasks")
        .select("*")
        .eq("Employee_ID", employee_id)
        .limit(1)
        .execute()
    )
    latest_task = task_resp.data[0] if task_resp.data else None

    if not worker and not latest_task:
        return {"status": "empty", "message": "No data found for this employee."}

    return {"status": "ok", "latest_task": latest_task, "worker": worker}


# ---------- Risk scoring (real, computed from actual data) ----------

def compute_employee_risk_score(employee_id: str) -> dict:
    """
    Computes a real risk score (0-100) from actual onboarding task
    status and pulse survey data for the given employee — replaces
    the previous hardcoded placeholder value.

    Rules (simple, explainable):
      - Each "Escalated" task            -> +15
      - Each overdue "Not Started" task  -> +10
      - Pulse survey missing entirely    -> +20
      - Pulse survey present, negative   -> +20
      - Pulse survey present, neutral    -> +10
      - Pulse survey present, positive   -> +0
    Score is capped at 100.
    """
    tasks_resp = (
        supabase.table("Onboarding_Tasks")
        .select("*")
        .eq("Employee_ID", employee_id)
        .execute()
    )
    tasks = tasks_resp.data or []

    pulse_resp = (
        supabase.table("Peakon_Engagement")
        .select("*")
        .eq("Employee_ID", employee_id)
        .execute()
    )
    pulse_records = pulse_resp.data or []

    score = 0
    today = datetime.now(timezone.utc).date()

    escalated_count = 0
    overdue_not_started = 0

    for t in tasks:
        status = (t.get("Status") or "").strip()

        if status == "Escalated":
            escalated_count += 1
            score += 15

        elif status == "Not Started":
            due_date_str = t.get("Due_Date")
            if due_date_str:
                try:
                    due_date = datetime.fromisoformat(due_date_str).date()
                    if due_date < today:
                        overdue_not_started += 1
                        score += 10
                except Exception:
                    pass

    pulse_survey_missing = len(pulse_records) == 0

    if pulse_survey_missing:
        score += 20
    else:
        latest_pulse = sorted(
            pulse_records, key=lambda r: r.get("Submitted_At") or "", reverse=True
        )[0]
        sentiment = (latest_pulse.get("sentiment") or "").lower()
        if sentiment == "negative":
            score += 20
        elif sentiment == "neutral":
            score += 10
        # positive sentiment adds nothing

    score = min(score, 100)

    return {
        "risk_score": score,
        "pulse_survey_missing": pulse_survey_missing,
        "escalated_tasks": escalated_count,
        "overdue_not_started_tasks": overdue_not_started,
    }


# ---------- Policies ----------

def list_policies():
    resp = supabase.table("policies").select("*").order("created_at").execute()
    return resp.data


def get_policy(policy_id: str):
    resp = supabase.table("policies").select("*").eq("id", policy_id).limit(1).execute()
    return resp.data[0] if resp.data else None


def get_active_policies():
    resp = (
        supabase.table("policies")
        .select("*")
        .eq("is_active", True)
        .execute()
    )
    return resp.data


def update_policy(policy_id: str, updates: dict):
    resp = (
        supabase.table("policies")
        .update(updates)
        .eq("id", policy_id)
        .execute()
    )
    return resp.data


# ---------- Policy evaluations / exceptions ----------

def log_policy_evaluation(
    policy_id: str,
    policy_name: str,
    employee_id: str | None,
    result: str,
    action_taken: str | None,
    context: dict | None = None,
):
    row = {
        "policy_id": policy_id,
        "policy_name": policy_name,
        "employee_id": employee_id,
        "result": result,
        "action_taken": action_taken,
        "context": context,
        "evaluated_at": datetime.utcnow().isoformat(),
        "status": "pending" if result == "triggered" else "n/a",
    }
    resp = supabase.table("policy_evaluations").insert(row).execute()
    return resp.data[0] if resp.data else row


def list_policy_evaluations(limit: int = 50):
    resp = (
        supabase.table("policy_evaluations")
        .select("*")
        .order("evaluated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data


def list_pending_exceptions():
    resp = (
        supabase.table("policy_evaluations")
        .select("*")
        .eq("result", "triggered")
        .order("evaluated_at", desc=True)
        .execute()
    )
    return resp.data


def resolve_exception(evaluation_id: str, status: str, reviewer_note: str | None):
    resp = (
        supabase.table("policy_evaluations")
        .update(
            {
                "status": status,
                "reviewer_note": reviewer_note,
                "reviewed_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", evaluation_id)
        .execute()
    )
    return resp.data


def get_evaluation(evaluation_id: str):
    resp = (
        supabase.table("policy_evaluations")
        .select("*")
        .eq("id", evaluation_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def count_rejections_since(policy_id: str, since_iso: str) -> int:
    resp = (
        supabase.table("policy_evaluations")
        .select("id", count="exact")
        .eq("policy_id", policy_id)
        .eq("status", "rejected")
        .gt("reviewed_at", since_iso)
        .execute()
    )
    return resp.count or 0


# ---------- AI Insights ----------

def save_insight(insight: dict):
    row = {**insight, "generated_at": datetime.utcnow().isoformat()}
    resp = supabase.table("ai_insights").insert(row).execute()
    return resp.data[0] if resp.data else row


def list_insights(limit: int = 50):
    resp = (
        supabase.table("ai_insights")
        .select("*")
        .order("generated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data


# ---------- Orchestrator run state (fire-and-forget tracking) ----------

def create_orchestrator_run(employee_id: str | None = None):
    # NOTE: employee_id is intentionally NOT written to the orchestrator_runs
    # row here — the orchestrator_runs table does not have a column for it
    # (confirmed by a PGRST204 schema error), so writing it would break this
    # insert entirely. The employee actually used for this run is still
    # recorded correctly inside policy_results once the run completes.
    row = {
        "workflow_id": None,
        "status": "running",
        "activity_runs": [],
        "policy_results": [],
        "triggered_at": datetime.utcnow().isoformat(),
    }
    resp = supabase.table("orchestrator_runs").insert(row).execute()
    return resp.data[0] if resp.data else row


def update_orchestrator_run(run_id: str, updates: dict):
    resp = (
        supabase.table("orchestrator_runs")
        .update(updates)
        .eq("id", run_id)
        .execute()
    )
    return resp.data[0] if resp.data else None


def fetch_latest_orchestrator_run():
    resp = (
        supabase.table("orchestrator_runs")
        .select("*")
        .order("triggered_at", desc=True)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return resp.data[0]


def clear_orchestrator_runs():
    supabase.table("orchestrator_runs").delete().neq(
        "id", "00000000-0000-0000-0000-000000000000"
    ).execute()
    return {"status": "cleared"}


# ---------- Dashboard stats (real day-over-day trends) ----------

def _day_bounds(days_ago: int = 0):
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    end_of_day = start_of_day + timedelta(days=1)
    return start_of_day.isoformat(), end_of_day.isoformat()


def get_dashboard_stats() -> dict:
    today_start, today_end = _day_bounds(0)
    yesterday_start, yesterday_end = _day_bounds(1)

    all_evals = (
        supabase.table("policy_evaluations")
        .select("employee_id, evaluated_at, result, status")
        .execute()
    ).data or []

    all_employee_ids = {e["employee_id"] for e in all_evals if e.get("employee_id")}
    today_employee_ids = {
        e["employee_id"]
        for e in all_evals
        if e.get("employee_id") and today_start <= (e.get("evaluated_at") or "") < today_end
    }

    triggered_today = [
        e for e in all_evals
        if e.get("result") == "triggered" and today_start <= (e.get("evaluated_at") or "") < today_end
    ]
    triggered_yesterday = [
        e for e in all_evals
        if e.get("result") == "triggered" and yesterday_start <= (e.get("evaluated_at") or "") < yesterday_end
    ]

    pending_count = len([e for e in all_evals if e.get("status") == "pending"])

    runs = (
        supabase.table("orchestrator_runs")
        .select("activity_runs, triggered_at")
        .execute()
    ).data or []

    operators_today = sum(
        len(r.get("activity_runs") or [])
        for r in runs
        if today_start <= (r.get("triggered_at") or "") < today_end
    )
    operators_yesterday = sum(
        len(r.get("activity_runs") or [])
        for r in runs
        if yesterday_start <= (r.get("triggered_at") or "") < yesterday_end
    )

    def pct_change(today_val: int, yesterday_val: int) -> float | None:
        if yesterday_val == 0:
            return None
        return round(((today_val - yesterday_val) / yesterday_val) * 100, 1)

    return {
        "employees_processed_total": len(all_employee_ids),
        "employees_processed_today": len(today_employee_ids),
        "operators_run_total": sum(len(r.get("activity_runs") or []) for r in runs),
        "operators_run_today": operators_today,
        "operators_run_change_pct": pct_change(operators_today, operators_yesterday),
        "policies_triggered_total": len([e for e in all_evals if e.get("result") == "triggered"]),
        "policies_triggered_today": len(triggered_today),
        "policies_triggered_change_pct": pct_change(len(triggered_today), len(triggered_yesterday)),
        "pending_escalations": pending_count,
    }


# ---------- User settings ----------

def get_user_settings(user_email: str):
    resp = (
        supabase.table("user_settings")
        .select("*")
        .eq("user_email", user_email)
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]

    row = {
        "user_email": user_email,
        "dark_mode": False,
        "email_alerts": True,
        "auto_refresh": True,
        "updated_at": datetime.utcnow().isoformat(),
    }
    insert_resp = supabase.table("user_settings").insert(row).execute()
    return insert_resp.data[0] if insert_resp.data else row


def update_user_settings(user_email: str, updates: dict):
    updates["updated_at"] = datetime.utcnow().isoformat()
    resp = (
        supabase.table("user_settings")
        .update(updates)
        .eq("user_email", user_email)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    return get_user_settings(user_email)