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
    ADMIN_ASSIGN = "ADMIN_ASSIGN"
    TRANSFER = "TRANSFER"


class ReservationStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    CONFIRMED = "CONFIRMED"
    DROPPED = "DROPPED"
    CANCELLED = "CANCELLED"


class ConfirmedBy(str, enum.Enum):
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"
    REAPPLY = "REAPPLY"
    TRANSFER = "TRANSFER"


class MailType(str, enum.Enum):
    EMAIL_VERIFY = "EMAIL_VERIFY"
    RESERVE_DONE_NORMAL = "RESERVE_DONE_NORMAL"
    RESERVE_DONE_REAPPLY = "RESERVE_DONE_REAPPLY"
    DROP_REAPPLY_NOTICE = "DROP_REAPPLY_NOTICE"


class TeamsMessageType(str, enum.Enum):
    RESERVE_REMINDER = "RESERVE_REMINDER"
    RESERVE_OPEN_NOTICE = "RESERVE_OPEN_NOTICE"
    TRANSFER_REQUEST_ADMIN = "TRANSFER_REQUEST_ADMIN"
    TRANSFER_APPROVED = "TRANSFER_APPROVED"


class TransferRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class MailStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENDING = "SENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    DEAD = "DEAD"
