from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status


class AppError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 400):
        self.code = code
        self.message = message
        self.http_status = http_status
        super().__init__(message)


ERROR_MESSAGES = {
    "EMAIL_DUPLICATED": "이미 가입된 이메일입니다.",
    "PASSWORD_MISMATCH": "비밀번호가 일치하지 않습니다.",
    "PASSWORD_RULE": "비밀번호는 영문/숫자/특수문자를 포함해야 합니다.",
    "TOKEN_INVALID": "유효하지 않은 인증 링크입니다.",
    "TOKEN_EXPIRED": "인증 링크가 만료되었습니다.",
    "NOT_VERIFIED": "이메일 인증 후 이용 가능합니다.",
    "AUTH_FAILED": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "ACCOUNT_LOCKED": "로그인 시도가 많아 잠시 후 다시 시도해주세요.",
    "NOT_OPEN": "현재 예약 신청 기간이 아닙니다.",
    "NOT_CANCELABLE": "마감 이후에는 취소할 수 없습니다.",
    "NOT_CONFIRMABLE_BEFORE_CLOSE": "일반 신청 마감(수요일 17:00) 이후에 확정할 수 있습니다.",
    "DUPLICATE_APPLY": "이미 신청한 시간입니다.",
    "WEEK_APPLY_LIMIT": "이번 주에는 한 타임만 신청할 수 있습니다.",
    "VACATION_SLOT": "안마사 휴무일입니다.",
    "NOT_REAPPLY_PERIOD": "재신청 기간이 아닙니다.",
    "NOT_DROPPED_USER": "재신청 대상이 아닙니다.",
    "SLOT_ALREADY_CONFIRMED": "이미 예약이 완료된 날짜 및 시간대입니다.",
    "VACATION_LOCKED": "예약 오픈 후에는 해당 주차 휴가를 등록할 수 없습니다.",
    "FORBIDDEN": "권한이 없습니다.",
    "UNAUTHORIZED": "로그인이 필요합니다.",
    "RESEND_COOLDOWN": "잠시 후 다시 시도해주세요.",
    "ALREADY_VERIFIED": "이미 인증된 계정입니다.",
    "WITHDRAW_BLOCKED": "진행 중인 예약이 있어 탈퇴할 수 없습니다.",
    "INVALID_CURRENT_PASSWORD": "현재 비밀번호가 올바르지 않습니다.",
    "NOT_FOUND": "요청한 리소스를 찾을 수 없습니다.",
    "SSO_NOT_CONFIGURED": "Microsoft SSO 설정이 완료되지 않았습니다.",
}


def raise_app_error(code: str, http_status: Optional[int] = None) -> None:
    status_map = {
        "EMAIL_DUPLICATED": 409,
        "NOT_OPEN": 409,
        "NOT_CANCELABLE": 409,
        "NOT_CONFIRMABLE_BEFORE_CLOSE": 409,
        "DUPLICATE_APPLY": 409,
        "WEEK_APPLY_LIMIT": 409,
        "VACATION_SLOT": 409,
        "NOT_REAPPLY_PERIOD": 409,
        "SLOT_ALREADY_CONFIRMED": 409,
        "VACATION_LOCKED": 409,
        "NOT_VERIFIED": 403,
        "NOT_DROPPED_USER": 403,
        "FORBIDDEN": 403,
        "AUTH_FAILED": 401,
        "UNAUTHORIZED": 401,
        "TOKEN_EXPIRED": 410,
    }
    status_code = http_status or status_map.get(code, 400)
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": ERROR_MESSAGES.get(code, code)}},
    )
