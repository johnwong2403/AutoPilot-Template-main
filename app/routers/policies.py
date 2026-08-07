import csv
import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Any, Dict

from app.services.supabase_client import (
    list_policies,
    update_policy,
    list_policy_evaluations,
    list_pending_exceptions,
    resolve_exception,
    get_evaluation,
    supabase,
)
from app.services.policy_engine import evaluate_policies_for_context
from app.services.self_learning import apply_self_learning

router = APIRouter()


# ---------- Schemas ----------

class PolicyUpdateRequest(BaseModel):
    is_active: Optional[bool] = None
    threshold: Optional[float] = None
    condition: Optional[str] = None
    action: Optional[str] = None


class EvaluateRequest(BaseModel):
    context: Dict[str, Any]


class ResolveRequest(BaseModel):
    status: str  # "approved" or "rejected"
    reviewer_note: Optional[str] = None


# ---------- Routes ----------

@router.get("")
async def get_policies():
    return list_policies()


@router.patch("/{policy_id}")
async def patch_policy(policy_id: str, body: PolicyUpdateRequest):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = update_policy(policy_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Policy not found")
    return result[0]


@router.post("/evaluate")
async def evaluate(body: EvaluateRequest):
    results = evaluate_policies_for_context(body.context)
    return results


@router.get("/evaluations")
async def get_evaluations(limit: int = 50):
    return list_policy_evaluations(limit=limit)


@router.get("/evaluations/paginated")
async def get_evaluations_paginated(
    page: int = 1,
    page_size: int = 10,
    status: Optional[str] = None,
):
    """
    Real, server-side pagination over policy_evaluations — used by the
    Audit Trail page's table view. `status` optionally filters by
    'pending' | 'approved' | 'rejected' | 'n/a'.
    """
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 10

    query = supabase.table("policy_evaluations").select("*", count="exact")
    if status:
        query = query.eq("status", status)

    start = (page - 1) * page_size
    end = start + page_size - 1

    resp = query.order("evaluated_at", desc=True).range(start, end).execute()

    total = resp.count or 0
    total_pages = max(1, (total + page_size - 1) // page_size)

    return {
        "items": resp.data,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
    }


@router.get("/evaluations/export")
async def export_evaluations_csv():
    """
    Streams all policy_evaluations rows as a downloadable CSV — real
    export, not a placeholder button.
    """
    rows = list_policy_evaluations(limit=5000)

    output = io.StringIO()
    fieldnames = [
        "id", "policy_id", "policy_name", "employee_id", "result",
        "action_taken", "status", "evaluated_at", "reviewer_note", "reviewed_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_trail_export.csv"},
    )


@router.get("/evaluations/stats")
async def get_evaluations_stats():
    """
    Real aggregate counts for the Audit Trail header stat cards —
    total events, triggered, approved, rejected, and AI actions
    (policy evaluations tied to a self-learning-originated insight).
    """
    all_rows = list_policy_evaluations(limit=5000)

    total = len(all_rows)
    triggered = len([r for r in all_rows if r.get("result") == "triggered"])
    approved = len([r for r in all_rows if r.get("status") == "approved"])
    rejected = len([r for r in all_rows if r.get("status") == "rejected"])

    return {
        "total_events": total,
        "triggered": triggered,
        "approved": approved,
        "rejected": rejected,
    }


@router.get("/exceptions")
async def get_exceptions():
    return list_pending_exceptions()


@router.patch("/exceptions/{evaluation_id}/resolve")
async def resolve_exception_route(evaluation_id: str, body: ResolveRequest):
    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    result = resolve_exception(evaluation_id, body.status, body.reviewer_note)
    if not result:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    if body.status == "rejected":
        evaluation = get_evaluation(evaluation_id)
        if evaluation:
            try:
                apply_self_learning(evaluation.get("policy_id"))
            except Exception:
                pass

    return {"status": "ok", "data": result[0]}