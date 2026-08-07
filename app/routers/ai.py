"""
ai.py

FastAPI routes for the AI Manager conversational surface.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from app.services.ai_manager import handle_chat_message

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    context: dict[str, Any] | None = None


class ToolCallResponse(BaseModel):
    id: str
    name: str
    args: dict[str, Any]
    result: Any | None = None


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[ToolCallResponse] = []


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Answers a question grounded in real Supabase data, and can trigger
    an Auto Orchestrator run when the person asks for one.
    """
    try:
        result = await handle_chat_message(
            message=request.message,
            history=[m.model_dump() for m in request.history],
            context=request.context,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Manager failed: {e}")

    return ChatResponse(**result)