from app.services.supabase_client import get_active_policies, log_policy_evaluation


def _evaluate_single_policy(policy: dict, context: dict) -> dict:
    """
    Returns a dict describing the outcome of evaluating one policy
    against the given context. Does NOT log to Supabase — caller does that.
    """
    rule_key = policy.get("rule_key")
    policy_id = policy.get("id")
    policy_name = policy.get("name") or policy.get("rule_key")
    action = policy.get("action") or "flag_for_review"
    threshold = policy.get("threshold")

    employee_id = context.get("employee_id")

    result = "passed"
    action_taken = None

    if rule_key == "risk_escalation_threshold":
        risk_score = context.get("risk_score")
        limit = threshold if threshold is not None else 80
        if risk_score is not None and risk_score > limit:
            result = "triggered"
            action_taken = f"escalate_to_manager (risk_score={risk_score} > {limit})"

    elif rule_key == "missing_pulse_survey_days":
        pulse_missing = context.get("pulse_survey_missing")
        days_since_hire = context.get("days_since_hire")
        min_days = threshold if threshold is not None else 14
        if pulse_missing and days_since_hire is not None and days_since_hire > min_days:
            result = "triggered"
            action_taken = f"flag_for_review (missing_engagement_data, {days_since_hire}d since hire)"

    elif rule_key == "standard_onboarding_notify":
        is_new_hire = context.get("is_new_hire")
        if is_new_hire:
            result = "triggered"
            action_taken = "notify_manager (standard onboarding checklist assigned)"

    else:
        # Unknown rule_key — treat as passed but don't crash the whole evaluation run
        result = "passed"
        action_taken = None

    return {
        "policy_id": policy_id,
        "policy_name": policy_name,
        "employee_id": employee_id,
        "result": result,
        "action_taken": action_taken,
    }


def evaluate_policies_for_context(context: dict) -> list[dict]:
    """
    Loads all active policies, evaluates each against the given context,
    logs every evaluation (triggered or passed) to Supabase, and returns
    the list of results for the API response.
    """
    active_policies = get_active_policies()
    results = []

    for policy in active_policies:
        outcome = _evaluate_single_policy(policy, context)

        logged = log_policy_evaluation(
            policy_id=outcome["policy_id"],
            policy_name=outcome["policy_name"],
            employee_id=outcome["employee_id"],
            result=outcome["result"],
            action_taken=outcome["action_taken"],
            context=context,
        )

        # Prefer the row Supabase actually stored (has real id/status/timestamps)
        # but fall back to our computed outcome if insert didn't return data.
        if isinstance(logged, dict) and logged.get("id"):
            results.append(logged)
        else:
            results.append(outcome)

    return results