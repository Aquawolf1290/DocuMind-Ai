import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes import auth, documents

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


def _cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    return origins or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
    ]

app = FastAPI(
    title="DocuMind AI API",
    description="Enterprise document intelligence platform with specialized AI agents.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
Path("storage/uploads").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="storage/uploads"), name="uploads")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "DocuMind AI"}
