import hashlib
import os
from typing import Optional

import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET environment variable is missing or shorter than 32 characters."
    )

# SHA-256 digests of publicly exposed example/default values from Project 1.
_PUBLIC_JWT_SECRET_DIGESTS = {
    "57dc58ab6a5430ed24e4790c53e8e116fcee101d28b7ae6e693a6b4e4f7d1e9f",
    "9fea218fda99ce46fc1c1eeab3665cdeaa6c5682c068b6455e3116bdd05d6d86",
}
if hashlib.sha256(JWT_SECRET.strip().encode("utf-8")).hexdigest() in (
    _PUBLIC_JWT_SECRET_DIGESTS
):
    raise RuntimeError(
        "JWT_SECRET is a publicly known default value. Generate a new random secret."
    )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu đăng nhập (Missing Authorization header)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expected_client_id = os.getenv("CLIENT_ID", "project-two-api")
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=["HS256"],
            audience=expected_client_id,
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token không hợp lệ (Missing subject claim)",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {
            "id": str(user_id),
            "email": payload.get("email"),
            "aud": payload.get("aud"),
            "is_owner": bool(payload.get("is_owner", False)),
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên làm việc đã hết hạn (Token expired)",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Token không dành cho dịch vụ này "
                f"(Audience mismatch: expected '{expected_client_id}')"
            ),
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
