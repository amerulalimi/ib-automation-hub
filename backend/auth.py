"""Encryption (tokens) and JWT auth."""
import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import JWT_SECRET, MASTER_ENCRYPTION_KEY

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24
security = HTTPBearer(auto_error=False)
AUTH_COOKIE_NAME = "sb_token"


def _derive_key() -> bytes:
    master = MASTER_ENCRYPTION_KEY or os.getenv("MASTER_ENCRYPTION_KEY", "")
    if len(master) < 16:
        raise ValueError("MASTER_ENCRYPTION_KEY must be at least 16 characters")
    return hashlib.scrypt(
        master.encode(), salt=b"signal-bridge-v1", n=16384, r=8, p=1, dklen=32
    )


def encrypt_token(plaintext: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = _derive_key()
    iv = os.urandom(16)
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return iv.hex() + ":" + tag.hex() + ":" + ct.hex()


def decrypt_token(ciphertext: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid ciphertext format")
    iv = bytes.fromhex(parts[0])
    tag = bytes.fromhex(parts[1])
    ct = bytes.fromhex(parts[2])
    key = _derive_key()
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct + tag, None).decode()


def token_hint(plain: str, chars: int = 4) -> str:
    return plain[-chars:]


def _jwt_secret() -> str:
    s = JWT_SECRET
    if not s:
        raise HTTPException(status_code=500, detail="JWT_SECRET not configured")
    return s


def create_access_token(email: str, user_id: str, role: str) -> str:
    try:
        from jose import jwt
    except ImportError:
        raise HTTPException(status_code=500, detail="python-jose not installed")
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": email, "uid": user_id, "role": role, "exp": expire},
        _jwt_secret(),
        algorithm=JWT_ALGORITHM,
    )


def require_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    token: Optional[str] = None
    if credentials is not None:
        token = credentials.credentials
    if not token:
        token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        from jose import jwt
    except ImportError:
        raise HTTPException(status_code=500, detail="python-jose not installed")
    try:
        payload = jwt.decode(
            token,
            _jwt_secret(),
            algorithms=[JWT_ALGORITHM],
        )
        # Legacy tokens (pre-RBAC): treat as admin with no uid until re-login.
        if not payload.get("role"):
            payload["role"] = "admin"
        if "uid" not in payload:
            payload["uid"] = None
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
