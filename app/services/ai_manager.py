"""
ai_manager.py

Backend logic for the AI Manager chat surface. Grounds every answer in
real data pulled from Supabase (never invents numbers), and can trigger
an Auto Orchestrator run when the person asks for one.
"""

import os
import json
import asyncio
from typing import Any

import google.generativeai as genai

from app.services.supabase_client import (
    fetch_latest_onboarding_snapshot,
    list_policies,
    list_pending_exceptions,
    list_insights,
)
from app.services.orchestrator_tracker import start_new_run, run_and_track

# Longer, specific phrases first.
_TRIGGER_PHRASES = [
    "run onboarding",
    "run the onboarding",
    "trigger onboarding",
    "trigger the orchestrator",
    "start onboarding cycle",
    "run onboarding cycle",
    "kick off onboarding",
]

# Short standalone commands — matched only when they're the ENTIRE
# message (after trimming), so "run" triggers it but a sentence that
# happens to contain the word "run" elsewhere does not.
_SHORT_TRIGGER_COMMANDS = {"run", "run it", "go", "start", "trigger", "start it"}


def _wants_to_trigger_run(message: str) -> bool:
    lowered = message.strip().lower()
    if lowered in _SHORT_TRIGGER_COMMANDS:
        return True
    return any(phrase in lowered for phrase in _TRIGGER_PHRASES)


def _gather_context() -> dict[str, Any]:
    try:
        snapshot = fetch_latest_onboarding_snapshot()
    except Exception as e:
        snapshot = {"status": "error", "message": str(e)}

    try:
        policies = list_policies()
    except Exception:
        policies = []

    try:
        exceptions = list_pending_exceptions()
    except Exception:
        exceptions = []

    try:
        insights = list_insights(limit=10)
    except Exception:
        insights = []

    return {
        "latest_onboarding_snapshot": snapshot,
        "active_policies": policies,
        "pending_exceptions": exceptions,
        "recent_insights": insights,
    }


def _build_system_prompt(context: dict[str, Any], page: str | None) -> str:
    context_json = json.dumps(context, default=str, indent=2)
    return f"""You are the AI Manager for an HR Onboarding & Retention Command Center.
You answer questions from real operational data only. You must NEVER invent
numbers, names, or statuses that are not present in the data below. If the
data doesn't contain the answer, say so plainly and suggest where a person
could look (e.g. the Workbench, AI Policies, or AI Insights page) instead of
guessing.

The person is currently viewing: {page or 'the Dashboard'}

Here is the current, live operational data (JSON):
{context_json}

Answer concisely and in plain language, as a knowledgeable operations
assistant would. If asked to run or re-run onboarding, tell the person
you've started it in the background and it may pause for a human approval
step in Supervity Auto — they can check the Dashboard for live progress.
"""


def _call_gemini(system_prompt: str, history: list[dict[str, str]], message: str) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return (
            "AI Manager isn't fully configured yet — GEMINI_API_KEY is missing "
            "on the backend."
        )

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-flash-latest",
        system_instruction=system_prompt,
    )

    gemini_history = []
    for turn in history:
        role = "model" if turn.get("role") == "assistant" else "user"
        content = turn.get("content", "")
        if content:
            gemini_history.append({"role": role, "parts": [content]})

    chat = model.start_chat(history=gemini_history)
    response = chat.send_message(message)
    return response.text or "I couldn't generate a response for that."


async def handle_chat_message(
    message: str,
    history: list[dict[str, str]],
    context: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Main entry point called by the /api/ai/chat route. Gathers real data,
    optionally kicks off a fire-and-forget Orchestrator run, and returns
    a grounded reply immediately (never blocks on the Auto run itself).
    """
    page = (context or {}).get("page")
    tool_calls: list[dict[str, Any]] = []

    if _wants_to_trigger_run(message):
        try:
            run = await start_new_run()
            asyncio.create_task(run_and_track(run["id"]))
            tool_calls.append(
                {
                    "id": "trigger_orchestrator",
                    "name": "trigger_orchestrator",
                    "args": {},
                    "result": {"status": "started", "run_id": run.get("id")},
                }
            )
        except Exception as e:
            tool_calls.append(
                {
                    "id": "trigger_orchestrator",
                    "name": "trigger_orchestrator",
                    "args": {},
                    "result": {"status": "error", "detail": str(e)},
                }
            )

    data_context = _gather_context()
    system_prompt = _build_system_prompt(data_context, page)
    reply_text = _call_gemini(system_prompt, history, message)

    return {"response": reply_text, "tool_calls": tool_calls}