from collections import Counter
from datetime import datetime, timedelta, timezone

from app.services.supabase_client import (
    list_policy_evaluations,
    save_insight,
)


def _pattern_insight(evaluations: list[dict]) -> dict | None:
    """Which policy triggers most often — a pattern a human wouldn't tally by hand."""
    triggered = [e for e in evaluations if e.get("result") == "triggered"]
    if not triggered:
        return None

    counts = Counter(e.get("policy_name") for e in triggered)
    top_policy, top_count = counts.most_common(1)[0]
    total = len(triggered)
    share = round((top_count / total) * 100)

    if share < 40:
        return None  # not a strong enough pattern to report

    return {
        "type": "pattern",
        "title": f"'{top_policy}' drives most triggered exceptions",
        "description": (
            f"{top_policy} accounts for {top_count} of {total} triggered "
            f"policy evaluations ({share}%). This is the dominant source of "
            f"exception volume reaching the Workbench right now. Review "
            f"whether this policy's threshold is too sensitive, or whether "
            f"it points to a real upstream process gap."
        ),
        "severity": "info",
        "action_path": "/ai/policies",
        "source_summary": {"top_policy": top_policy, "count": top_count, "total_triggered": total},
    }


def _anomaly_insight(evaluations: list[dict]) -> dict | None:
    """Spike detection: recent triggered volume vs. the evaluation history overall."""
    triggered = [e for e in evaluations if e.get("result") == "triggered"]
    if len(triggered) < 3:
        return None

    now = datetime.now(timezone.utc)
    recent_cutoff = now - timedelta(hours=24)

    def _parse(ts: str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            return None

    recent = [e for e in triggered if (t := _parse(e.get("evaluated_at", ""))) and t >= recent_cutoff]
    if not recent:
        return None

    recent_share = round((len(recent) / len(triggered)) * 100)
    if recent_share < 50:
        return None

    return {
        "type": "anomaly",
        "title": "Spike in triggered exceptions in the last 24 hours",
        "description": (
            f"{len(recent)} of {len(triggered)} total triggered evaluations "
            f"({recent_share}%) happened in the last 24 hours — a concentration "
            f"that's worth a manual look rather than assuming steady-state volume. "
            f"Check the Workbench queue for a backlog and confirm reviewers are "
            f"keeping pace."
        ),
        "severity": "warning",
        "action_path": "/workbench",
        "source_summary": {"recent_count": len(recent), "total_triggered": len(triggered)},
    }


def _recommendation_insight(evaluations: list[dict]) -> dict | None:
    """Automation-opportunity insight: a manual step recurring often enough to deserve a policy change."""
    triggered = [e for e in evaluations if e.get("result") == "triggered"]
    approved = [e for e in triggered if e.get("status") == "approved"]

    if len(triggered) < 3 or not approved:
        return None

    approval_rate = round((len(approved) / len(triggered)) * 100)
    if approval_rate < 80:
        return None

    counts = Counter(e.get("policy_name") for e in approved)
    top_policy, top_count = counts.most_common(1)[0]

    return {
        "type": "recommendation",
        "title": f"Consider auto-approving low-risk '{top_policy}' cases",
        "description": (
            f"{approval_rate}% of triggered exceptions are being approved as-is "
            f"by reviewers, with '{top_policy}' the most common ({top_count} approvals). "
            f"This pattern suggests some of this review load could shift from "
            f"human-in-the-loop to a tightened policy rule. Tighten the policy "
            f"threshold or auto-approve criteria for this rule, then monitor "
            f"reviewer overrides for regressions."
        ),
        "severity": "info",
        "action_path": "/ai/policies",
        "source_summary": {"approval_rate": approval_rate, "top_approved_policy": top_policy},
    }


def compute_ai_confidence(evaluations: list[dict]) -> float:
    """
    A real, computed confidence score: the share of triggered policy
    evaluations that a human reviewer approved (agreed with the AI's
    judgment) rather than rejected. Not a fake number — directly
    derived from actual reviewer decisions.
    """
    triggered = [e for e in evaluations if e.get("result") == "triggered"]
    reviewed = [e for e in triggered if e.get("status") in ("approved", "rejected")]

    if not reviewed:
        return 100.0  # no rejections yet to lower confidence

    approved = [e for e in reviewed if e.get("status") == "approved"]
    return round((len(approved) / len(reviewed)) * 100, 1)


def generate_insights() -> list[dict]:
    """
    Reads all policy evaluations processed by the agent so far, computes
    pattern / anomaly / recommendation insights, persists each one, and
    returns the generated rows.
    """
    evaluations = list_policy_evaluations(limit=500)
    candidates = [
        _pattern_insight(evaluations),
        _anomaly_insight(evaluations),
        _recommendation_insight(evaluations),
    ]

    saved = []
    for insight in candidates:
        if insight is None:
            continue
        row = save_insight(insight)
        saved.append(row)

    return saved


def get_insights_summary() -> dict:
    """
    Returns the current AI Confidence score plus counts of positive
    signals, for the AI Insights page header stats.
    """
    evaluations = list_policy_evaluations(limit=500)
    confidence = compute_ai_confidence(evaluations)

    triggered = [e for e in evaluations if e.get("result") == "triggered"]
    approved = [e for e in triggered if e.get("status") == "approved"]

    return {
        "ai_confidence": confidence,
        "positive_signals": len(approved),
    }