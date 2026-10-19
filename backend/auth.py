import os
import re
from datetime import datetime, timedelta, timezone

import jwt

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from database import get_db
from models import User


router = APIRouter(prefix="/api/auth", tags=["Authentication"])

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer()

JWT_SECRET = os.environ.get("INTERVIEW_JWT_SECRET")

if not JWT_SECRET:
    JWT_SECRET = "dev-only-change-this-secret-before-use"


JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def user_response(user: User, token: str) -> dict:
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    full_name = request.full_name.strip()
    email = str(request.email).lower()

    if len(full_name) < 2:
        raise HTTPException(
            status_code=400,
            detail="Please provide your full name.",
        )

    if request.role not in {"hr", "candidate"}:
        raise HTTPException(
            status_code=400,
            detail="Role must be 'hr' or 'candidate'.",
        )

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=full_name,
        email=email,
        password_hash=password_hash.hash(request.password),
        role=request.role,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user_response(user, create_token(user))


@router.post("/login")
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    email = str(request.email).lower()

    user = db.query(User).filter(User.email == email).first()

    if not user or not password_hash.verify(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    return user_response(user, create_token(user))


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = int(payload["sub"])

    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User account no longer exists.",
        )

    return user


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
    }