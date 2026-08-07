"""
self_learning.py

Implements the "self-learning" bonus behavior: when a policy is
rejected by a human reviewer repeatedly, the system automatically
loosens that policy's threshold and records an AI Insight explaining
what changed and why — a real example of a human correction changing
future agent behavior.
"""

from datetime import datetime

from app.services.supabase_client import (
    get_policy,
    update_policy,
    count_rejections_since,
    save_insight,
)

REJECTION_THRESHOLD = 3
ADJUSTMENT_FACTOR = 1.10


def apply_self_learning(policy_id: str | None) -> None:
    if not policy_id:
        return

    policy = get_policy(policy_id)
    if not policy:
        return

    baseline = policy.get("updated_at") or policy.get("created_at")
    if not baseline:
        baseline = datetime.utcnow().isoformat()

    rejection_count = count_rejections_since(policy_id, baseline)
    if rejection_count < REJECTION_THRESHOLD:
        return

    threshold = policy.get("threshold")
    policy_name = policy.get("name") or policy.get("rule_key") or "Unnamed policy"

    if threshold is None:
        save_insight(
            {
                "type": "automation_opportunity",
                "severity": "warning",
                "title": f'"{policy_name}" has been rejected {rejection_count} times',
                "description": (
                    f'Human reviewers have rejected the "{policy_name}" policy '
                    f"{rejection_count} times in a row. This policy has no numeric "
                    "threshold to auto-adjust — consider reviewing its condition "
                    "or disabling it."
                ),
                "action_path": "/ai/policies",
                "source_summary": {"source": "self_learning", "policy_id": policy_id},
            }
        )
        update_policy(policy_id, {"updated_at": datetime.utcnow().isoformat()})
        return

    new_threshold = round(threshold * ADJUSTMENT_FACTOR, 2)
    update_policy(
        policy_id,
        {
            "threshold": new_threshold,
            "updated_at": datetime.utcnow().isoformat(),
        },
    )

    save_insight(
        {
            "type": "automation_opportunity",
            "severity": "info",
            "title": f'Self-learning: "{policy_name}" threshold auto-adjusted',
            "description": (
                f'Human reviewers rejected "{policy_name}" {rejection_count} times '
                f"in a row, so the system automatically loosened its threshold "
                f"from {threshold} to {new_threshold} to better match real "
                "reviewer judgment. Future runs will use the new threshold."
            ),
            "action_path": "/ai/policies",
            "source_summary": {"source": "self_learning", "policy_id": policy_id},
        }
    )