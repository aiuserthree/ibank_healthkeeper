"""체스 규칙과 컴퓨터 상대 — 규칙 판정은 python-chess 에 맡긴다.

쉬움은 자주 실수하고, 보통은 두 수 앞을, 어려움은 시간이 허락하는 만큼 네 수 앞까지 본다.
"""

from __future__ import annotations

import random
import time
from typing import Optional

import chess

LEVELS = ("easy", "normal", "hard")
VALUE = {chess.PAWN: 100, chess.KNIGHT: 320, chess.BISHOP: 330, chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0}
MATE = 1_000_000
HARD_SECONDS = 1.2


def board_of(moves: list) -> chess.Board:
    board = chess.Board()
    for uci in moves:
        board.push_uci(uci)
    return board


def ending(board: chess.Board) -> Optional[str]:
    if board.is_checkmate():
        return "CHECKMATE"
    if board.is_stalemate():
        return "STALEMATE"
    if board.is_insufficient_material() or board.can_claim_fifty_moves() or board.can_claim_threefold_repetition():
        return "DRAW"
    return None


def _evaluate(board: chess.Board) -> int:
    """지금 둘 차례인 쪽 기준 점수 — 기물 값에, 가운데로 나온 기물과 앞으로 나간 폰에 조금 더 준다."""
    total = 0
    for sq, piece in board.piece_map().items():
        file, rank = chess.square_file(sq), chess.square_rank(sq)
        score = VALUE[piece.piece_type]
        if piece.piece_type in (chess.KNIGHT, chess.BISHOP, chess.QUEEN):
            score += 12 - 3 * (abs(2 * file - 7) + abs(2 * rank - 7)) // 2
        elif piece.piece_type == chess.PAWN:
            score += 6 * (rank if piece.color == chess.WHITE else 7 - rank)
        total += score if piece.color == board.turn else -score
    return total


def _ordered(board: chess.Board) -> list:
    """잡는 수를 먼저 봐야 가지치기가 잘 된다."""
    def key(move: chess.Move) -> int:
        victim = board.piece_at(move.to_square)
        return (VALUE[victim.piece_type] if victim else 0) + (800 if move.promotion else 0)
    return sorted(board.legal_moves, key=key, reverse=True)


class _OutOfTime(Exception):
    pass


def _search(board: chess.Board, depth: int, alpha: int, beta: int, until: float) -> int:
    if time.monotonic() > until:
        raise _OutOfTime
    if board.is_checkmate():
        return -MATE - depth
    if board.is_stalemate():
        return 0
    if depth <= 0:
        return _evaluate(board)
    for move in _ordered(board):
        board.push(move)
        score = -_search(board, depth - 1, -beta, -alpha, until)
        board.pop()
        if score >= beta:
            return beta
        alpha = max(alpha, score)
    return alpha


def _best(board: chess.Board, depth: int, until: float, noise: int = 0) -> Optional[chess.Move]:
    best, top = None, -MATE * 2
    for move in _ordered(board):
        board.push(move)
        score = -_search(board, depth - 1, -MATE * 2, -top + noise, until) + random.randint(-noise, noise)
        board.pop()
        if score > top:
            best, top = move, score
    return best


def choose(moves: list, level: str) -> Optional[str]:
    """다음 수의 UCI 표기. 둘 수가 없으면 None."""
    board = board_of(moves)
    legal = list(board.legal_moves)
    if not legal:
        return None
    far = time.monotonic() + 30
    if level == "easy":
        pick = random.choice(legal) if random.random() < 0.3 else _best(board, 1, far, noise=90)
    elif level == "normal":
        pick = _best(board, 2, far, noise=15)
    else:
        pick = _best(board, 2, far)
        until = time.monotonic() + HARD_SECONDS
        for depth in (3, 4):
            try:
                pick = _best(board, depth, until) or pick
            except _OutOfTime:
                board = board_of(moves)            # 찾다 멈춘 자리에서 판을 되돌린다
                break
    return (pick or legal[0]).uci()
