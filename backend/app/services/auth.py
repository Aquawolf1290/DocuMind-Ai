import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.database import connect, utc_now


security = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    email: str
    name: str
    avatar: str
    role: str
    provider: str


def hash_password(password: str, salt: str | None = None) -> str:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), password_salt.encode("utf-8"), 120_000)
    return f"{password_salt}${digest.hex()}"


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash or "$" not in password_hash:
        return False
    salt, expected = password_hash.split("$", 1)
    actual = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(actual, expected)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_or_update_oauth_user(user: dict) -> dict:
    with connect() as connection:
        existing = connection.execute("SELECT * FROM users WHERE email = ?", (normalize_email(user["email"]),)).fetchone()
        if existing:
            connection.execute(
                """
                UPDATE users
                SET name = ?, avatar = ?, provider = ?
                WHERE id = ?
                """,
                (user["name"], user.get("avatar", ""), user.get("provider", "google"), existing["id"]),
            )
            return dict(connection.execute("SELECT * FROM users WHERE id = ?", (existing["id"],)).fetchone())

        user_id = user["id"]
        connection.execute(
            """
            INSERT INTO users (id, email, name, avatar, role, provider, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                user_id,
                normalize_email(user["email"]),
                user["name"],
                user.get("avatar", ""),
                user.get("role", "Admin"),
                user.get("provider", "google"),
                utc_now(),
            ),
        )
        return dict(connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def create_email_user(email: str, name: str, password: str) -> dict:
    email = normalize_email(email)
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    with connect() as connection:
        existing = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        user_id = f"email:{secrets.token_urlsafe(18)}"
        connection.execute(
            """
            INSERT INTO users (id, email, name, avatar, role, provider, password_hash, created_at)
            VALUES (?, ?, ?, '', 'Admin', 'email', ?, ?)
            """,
            (user_id, email, name.strip() or email.split("@")[0], hash_password(password), utc_now()),
        )
        return dict(connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def authenticate_email_user(email: str, password: str) -> dict:
    email = normalize_email(email)
    with connect() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return dict(user)


def create_session(user: dict) -> dict:
    token = f"documind_{secrets.token_urlsafe(32)}"
    issued_at = utc_now()
    with connect() as connection:
        connection.execute("INSERT INTO sessions (token, user_id, issued_at) VALUES (?, ?, ?)", (token, user["id"], issued_at))
    return {
        "access_token": token,
        "token_type": "bearer",
        "issued_at": issued_at,
        "user": public_user(user),
    }


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "avatar": user.get("avatar", ""),
        "role": user.get("role", "Admin"),
        "provider": user.get("provider", "email"),
    }


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> CurrentUser:
    if not credentials:
        raise HTTPException(status_code=401, detail="Sign in is required.")

    with connect() as connection:
        row = connection.execute(
            """
            SELECT users.*
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (credentials.credentials,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")

    user = dict(row)
    return CurrentUser(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        avatar=user.get("avatar", ""),
        role=user.get("role", "Admin"),
        provider=user.get("provider", "email"),
    )


def google_client_id() -> str | None:
    return os.getenv("GOOGLE_CLIENT_ID")
