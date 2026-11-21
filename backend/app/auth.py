"""Account authentication: password hashing, JWT tokens and current-user lookup."""
import os
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from . import db

SECRET = os.getenv('JWT_SECRET', 'resilifarm-dev-secret-change-me-in-production')
ALGORITHM = 'HS256'
TTL_HOURS = int(os.getenv('JWT_TTL_HOURS', '72'))

def _prepare(password):
    # bcrypt only considers the first 72 bytes; truncate consistently on both paths.
    return password.encode('utf-8')[:72]

def hash_password(password):
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, hashed):
    try:
        return bcrypt.checkpw(_prepare(password), hashed.encode('utf-8'))
    except ValueError:
        return False

def create_token(user_id):
    issued = datetime.now(timezone.utc)
    return jwt.encode({'sub': str(user_id), 'iat': issued, 'exp': issued + timedelta(hours=TTL_HOURS)}, SECRET, algorithm=ALGORITHM)

def public_user(user):
    return {'id': user['id'], 'email': user['email'], 'full_name': user['full_name'], 'role': user.get('role') or 'FARMER', 'created_at': user['created_at']}

_bearer = HTTPBearer(auto_error=False)

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)):
    if credentials is None:
        raise HTTPException(401, 'unauthenticated')
    try:
        user_id = int(jwt.decode(credentials.credentials, SECRET, algorithms=[ALGORITHM])['sub'])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(401, 'invalidToken')
    with db.engine.connect() as c:
        row = c.execute(select(db.users).where(db.users.c.id == user_id)).mappings().first()
    if not row:
        raise HTTPException(401, 'unauthenticated')
    return dict(row)

def admin_emails():
    """Accounts that should always hold the ADMIN role, from the environment."""
    return {email.strip().lower() for email in os.getenv('ADMIN_EMAILS', '').split(',') if email.strip()}

def require_roles(*roles):
    def dependency(user=Depends(current_user)):
        if (user.get('role') or 'FARMER') not in roles:
            raise HTTPException(403, 'forbidden')
        return user
    return dependency

require_admin = require_roles('ADMIN')
