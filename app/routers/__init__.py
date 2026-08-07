"""
Routers package.

Exposes all FastAPI routers used by the application.
"""

from .admin import router as admin_router
from .audit import router as audit_router
from .auth import router as auth_router
from .examples import router as examples_router
from .health import router as health_router
from .items import router as items_router
from .onboarding import router as onboarding_router
from .policies import router as policies_router
from .insights import router as insights_router
from .data_manager import router as data_manager_router
from .ai import router as ai_router
from .settings import router as settings_router

__all__ = [
    "admin_router",
    "audit_router",
    "auth_router",
    "examples_router",
    "health_router",
    "items_router",
    "onboarding_router",
    "policies_router",
    "insights_router",
    "data_manager_router",
    "ai_router",
    "settings_router",
]