from fastapi import APIRouter

from app.services.supabase_client import list_insights
from app.services.insights_engine import generate_insights, get_insights_summary

router = APIRouter()


@router.get("")
async def get_insights():
    return list_insights()


@router.post("/generate")
async def generate():
    return generate_insights()


@router.get("/summary")
async def get_summary():
    """
    Real, computed AI Confidence score and positive-signal count for
    the AI Insights page header — derived from actual human reviewer
    decisions, not a hardcoded number.
    """
    return get_insights_summary()