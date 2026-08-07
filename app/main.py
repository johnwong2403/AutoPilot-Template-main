"""
FastAPI Application Entry Point
"""

import io
import logging
import os

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from .authz import AuthzEngine
from .core.storage import GCSStorage, LocalStorage, StorageBackend
from .middleware import AuditMiddleware
from .routers import (
    admin_router,
    audit_router,
    auth_router,
    examples_router,
    health_router,
    items_router,
    onboarding_router,
    policies_router,
    insights_router,
    data_manager_router,
    ai_router,
    settings_router,
)
from .security import get_current_user, verify_access

log = logging.getLogger(__name__)

BASE_PATH = os.getenv("BASE_PATH", "")
if BASE_PATH and not BASE_PATH.startswith("/"):
    BASE_PATH = f"/{BASE_PATH}"
if BASE_PATH == "/":
    BASE_PATH = ""

log.info(f"API Base Path: '{BASE_PATH}' (empty means root)")

app = FastAPI(
    title="AutoPilot API",
    description="AI Command Center — Full-stack template with FastAPI, Next.js, and PostgreSQL",
    version="2.0.0",
    docs_url=f"{BASE_PATH}/api/docs",
    redoc_url=f"{BASE_PATH}/api/redoc",
    openapi_url=f"{BASE_PATH}/api/openapi.json",
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3001")
cors_origins = [
    frontend_url,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuditMiddleware)

api_router = APIRouter(
    prefix=f"{BASE_PATH}/api",
    dependencies=[Depends(verify_access)],
)


def get_storage_dependency() -> StorageBackend:
    backend = os.getenv("STORAGE_BACKEND", "local")
    if backend == "gcs":
        bucket = os.getenv("GCS_BUCKET")
        prefix = os.getenv("GCS_PREFIX", "")
        if not bucket:
            raise ValueError("GCS_BUCKET environment variable is required")
        return GCSStorage(bucket, prefix)
    else:
        path = os.getenv("LOCAL_STORAGE_PATH", "./document_storage")
        return LocalStorage(path)


api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(audit_router)
api_router.include_router(items_router)
api_router.include_router(examples_router)

api_router.include_router(onboarding_router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(policies_router, prefix="/policies", tags=["policies"])
api_router.include_router(insights_router, prefix="/insights", tags=["insights"])
api_router.include_router(data_manager_router, prefix="/data-manager", tags=["data-manager"])
api_router.include_router(ai_router, prefix="/ai", tags=["ai"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])


@api_router.get("/files/", tags=["Files"])
async def list_files(
    prefix: str = "",
    storage: StorageBackend = Depends(get_storage_dependency),
    user: dict = Depends(get_current_user),
):
    files = await storage.list_files(prefix)
    return {"files": files, "count": len(files)}


@api_router.post("/files/{file_path:path}", tags=["Files"])
async def upload_file(
    file_path: str,
    file: UploadFile = File(...),
    storage: StorageBackend = Depends(get_storage_dependency),
    user: dict = Depends(get_current_user),
):
    content = await file.read()
    url = await storage.save(file_path, content, file.content_type)
    return {
        "path": file_path,
        "url": url,
        "content_type": file.content_type,
        "size": len(content),
    }


@api_router.get("/files/{file_path:path}", tags=["Files"])
async def download_file(
    file_path: str,
    storage: StorageBackend = Depends(get_storage_dependency),
    user: dict = Depends(get_current_user),
):
    try:
        content, content_type = await storage.load(file_path)
        return StreamingResponse(
            io.BytesIO(content),
            media_type=content_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{file_path}"'},
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


@api_router.delete("/files/{file_path:path}", tags=["Files"])
async def delete_file(
    file_path: str,
    storage: StorageBackend = Depends(get_storage_dependency),
    user: dict = Depends(get_current_user),
):
    await storage.delete(file_path)
    return {"status": "deleted", "path": file_path}


app.include_router(api_router)


@app.get("/")
async def root():
    return {
        "name": "AutoPilot API",
        "version": "2.0.0",
        "docs": f"{BASE_PATH}/api/docs",
        "health": f"{BASE_PATH}/api/health",
        "base_path": BASE_PATH or "/",
    }


if BASE_PATH:

    @app.get(BASE_PATH)
    async def base_path_root():
        return {
            "name": "AutoPilot API",
            "version": "2.0.0",
            "docs": f"{BASE_PATH}/api/docs",
            "health": f"{BASE_PATH}/api/health",
            "base_path": BASE_PATH,
        }