from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class EmailCheckRequest(BaseModel):
    email: EmailStr


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str
    passwordConfirm: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginRequest(BaseModel):
    loginId: str
    password: str
    rememberMe: bool = False


class VerifyRequest(BaseModel):
    token: str


class ResendVerifyRequest(BaseModel):
    email: EmailStr


class PasswordChangeRequest(BaseModel):
    currentPassword: str
    newPassword: str
    newPasswordConfirm: str


class ConfirmRequest(BaseModel):
    reservationId: int


class VacationRequest(BaseModel):
    cycleId: int
    dates: list[str]


class VacationMonthRequest(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    dates: list[str]


class ReapplyMailSendRequest(BaseModel):
    memberIds: Optional[list[int]] = None


class SettingsUpdateRequest(BaseModel):
    settings: dict[str, str]
