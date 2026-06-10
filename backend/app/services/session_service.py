import os
import secrets
import time

TOKEN_TTL_SECONDS = 12 * 60 * 60

_admin_tokens: dict[str, float] = {}
_customer_tokens: dict[str, dict] = {}


def _cleanup():
    now = time.time()
    for token, expires_at in list(_admin_tokens.items()):
        if expires_at < now:
            _admin_tokens.pop(token, None)
    for token, payload in list(_customer_tokens.items()):
        if payload["expires_at"] < now:
            _customer_tokens.pop(token, None)


def admin_password() -> str:
    return os.getenv("ADMIN_PASSWORD", "admin123")


def dev_otp_code() -> str:
    return os.getenv("DEV_OTP_CODE", "000000")


def create_admin_token() -> str:
    _cleanup()
    token = secrets.token_urlsafe(32)
    _admin_tokens[token] = time.time() + TOKEN_TTL_SECONDS
    return token


def verify_admin_token(token: str | None) -> bool:
    _cleanup()
    if not token:
        return False
    expires_at = _admin_tokens.get(token)
    return bool(expires_at and expires_at > time.time())


def create_customer_token(phone: str) -> str:
    _cleanup()
    token = secrets.token_urlsafe(32)
    _customer_tokens[token] = {
        "phone": phone,
        "expires_at": time.time() + TOKEN_TTL_SECONDS,
    }
    return token


def get_customer_phone(token: str | None) -> str | None:
    _cleanup()
    if not token:
        return None
    payload = _customer_tokens.get(token)
    if not payload or payload["expires_at"] < time.time():
        return None
    return payload["phone"]
