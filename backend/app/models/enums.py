from __future__ import annotations

import enum


class MemberStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    WITHDRAWN = "WITHDRAWN"


class AdminRole(str, enum.Enum):
    ADMIN = "ADMIN"
    SUPER = "SUPER"


class CycleState(str, enum.Enum):
    BEFORE_OPEN = "BEFORE_OPEN"
    OPEN = "OPEN"
    REAPPLY = "REAPPLY"
    CLOSED = "CLOSED"


class SlotStatus(str, enum.Enum):
    OPEN = "OPEN"
    CONFIRMED = "CONFIRMED"


class ReservationType(str, enum.Enum):
    NORMAL = "NORMAL"
    REAPPLY = "REAPPLY"


class ReservationStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    CONFIRMED = "CONFIRMED"
    DROPPED = "DROPPED"
    CANCELLED = "CANCELLED"


class ConfirmedBy(str, enum.Enum):
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"
    REAPPLY = "REAPPLY"


class MailType(str, enum.Enum):
    EMAIL_VERIFY = "EMAIL_VERIFY"
    RESERVE_DONE_NORMAL = "RESERVE_DONE_NORMAL"
    RESERVE_DONE_REAPPLY = "RESERVE_DONE_REAPPLY"
    DROP_REAPPLY_NOTICE = "DROP_REAPPLY_NOTICE"


class MailStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENDING = "SENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    DEAD = "DEAD"
