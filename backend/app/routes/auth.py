from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.auth import (
    authenticate_email_user,
    create_email_user,
    create_or_update_oauth_user,
    create_session,
    google_client_id,
)

try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
except ImportError:  # pragma: no cover - handled at runtime with a clear API error
    google_requests = None
    id_token = None


router = APIRouter()


class GoogleAuthRequest(BaseModel):
    credential: str


class DemoAuthRequest(BaseModel):
    email: str
    name: str = "DocuMind User"


class EmailAuthRequest(BaseModel):
    email: str
    password: str
    name: str = "DocuMind User"
    mode: str = "signin"


@router.post("/google")
def sign_in_with_google(payload: GoogleAuthRequest):
    client_id = google_client_id()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the backend.")
    if not id_token or not google_requests:
        raise HTTPException(status_code=503, detail="Google auth dependency is missing. Install backend requirements.")

    try:
        claims = id_token.verify_oauth2_token(payload.credential, google_requests.Request(), client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in token.") from exc

    if not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google account email is not verified.")

    user = create_or_update_oauth_user(
        {
            "id": f"google:{claims['sub']}",
            "name": claims.get("name") or claims["email"],
            "email": claims["email"],
            "avatar": claims.get("picture", ""),
            "role": "Admin",
            "provider": "google",
        }
    )
    return create_session(user)


@router.post("/email")
def sign_in_with_email(payload: EmailAuthRequest):
    if "@" not in payload.email or "." not in payload.email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if payload.mode == "signup":
        return create_session(create_email_user(payload.email, payload.name, payload.password))
    if payload.mode != "signin":
        raise HTTPException(status_code=400, detail="Invalid auth mode.")
    return create_session(authenticate_email_user(payload.email, payload.password))


@router.post("/demo")
def sign_in_demo(payload: DemoAuthRequest):
    if "@" not in payload.email or "." not in payload.email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    user = create_or_update_oauth_user(
        {
            "id": f"demo:{payload.email}",
            "name": payload.name.strip() or payload.email.split("@")[0],
            "email": payload.email,
            "avatar": "",
            "role": "Admin",
            "provider": "demo",
        }
    )
    return create_session(user)
