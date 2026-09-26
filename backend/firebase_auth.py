"""Firebase ID token verification (Web Google sign-in) without firebase-admin SDK."""
import os
import logging
from typing import Optional
from google.oauth2 import id_token
from google.auth.transport import requests as g_requests

log = logging.getLogger(__name__)

FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "still-alive-66ae0")


def verify_firebase_id_token(token: str) -> Optional[dict]:
    """Verify a Firebase ID token and return claims, or None if invalid."""
    try:
        claims = id_token.verify_firebase_token(
            token, g_requests.Request(), audience=FIREBASE_PROJECT_ID
        )
        if not claims.get("email"):
            return None
        return {
            "email": claims["email"],
            "name": claims.get("name") or claims.get("email").split("@")[0],
            "picture": claims.get("picture"),
            "firebase_uid": claims.get("sub") or claims.get("user_id"),
            "email_verified": claims.get("email_verified", False),
        }
    except Exception as e:
        log.warning(f"firebase verify failed: {str(e)[:160]}")
        return None
