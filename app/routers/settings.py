"""
settings.py

Real, persisted user preferences (Quick Settings toggles) — stored in
Supabase per user email, not just client-side state that resets on
refresh.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.supabase_client import get_user_settings, update_user_settings

router = APIRouter()


class SettingsUpdateRequest(BaseModel):
    dark_mode: Optional[bool] = None
    email_alerts: Optional[bool] = None
    auto_refresh: Optional[bool] = None


@router.get("/{user_email}")
async def get_settings(user_email: str):
    try:
        return get_user_settings(user_email)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to load settings: {str(e)}")


@router.patch("/{user_email}")
async def patch_settings(user_email: str, body: SettingsUpdateRequest):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        return update_user_settings(user_email, updates)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to update settings: {str(e)}")