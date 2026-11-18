"""선다운 범퍼스 대전 — 3바퀴 경주 결과 검사(versus_bumpervs._clean): 시간 상한 5분 · 트랙별 최소 결승 기록."""

import unittest

from fastapi import HTTPException as AppError  # raise_app_error 는 HTTPException 을 던진다
from app.services import party, versus_bumpervs as vb


class BumperLaps(unittest.TestCase):
    def test_limits_match(self):
        self.assertEqual(vb.LIMIT_SEC, 300)
        self.assertEqual(party.LIMIT_SEC, vb.LIMIT_SEC)
        self.assertEqual(party.MIN_FINISH, vb.MIN_FINISH)
        self.assertEqual(len(vb.MIN_FINISH), vb.TRACKS)
        # 3바퀴 — 가장 빠른 기록 하한도 90초가 넘고, 보통 실력 실측(130 ~ 155초)보다 넉넉히 낮다
        self.assertTrue(all(90 <= x <= 120 for x in vb.MIN_FINISH))
        self.assertLess(vb.MIN_PLAY_SEC, min(vb.MIN_FINISH))

    def test_normal_three_lap_results(self):
        ok = vb._clean({"winner": "host", "order": [141.2, 148.0], "track": 1, "sec": 148.0})
        self.assertEqual(ok["order"], [141.2, 148.0])
        # 긴 판 — 한 사람만 4분 40초에 들어오고 상대는 12초를 기다려도 못 들어옴
        late = vb._clean({"winner": "guest", "order": [None, 280.0], "track": 9, "sec": 292.0})
        self.assertEqual(late["winner"], "guest")
        # 아무도 못 들어옴 — 5분이 다 된 뒤에만, 더 멀리 간 쪽
        far = vb._clean({"winner": "host", "order": [None, None], "track": 3, "sec": 300.0, "dist": [0.93, 0.9]})
        self.assertEqual(far["dist"], [0.93, 0.9])

    def test_bad_three_lap_results(self):
        bad = [
            {"winner": "host", "order": [60.0, None], "track": 1, "sec": 72.0},  # 3바퀴에 1분 — 너무 빠름
            {"winner": "host", "order": [98.0, 100.0], "track": 1, "sec": 100.0},  # 트랙 1 최소 99초보다 빠름
            {"winner": "host", "order": [None, None], "track": 1, "sec": 180.0, "dist": [0.6, 0.5]},  # 예전 3분 — 아직 시간이 남음
            {"winner": "host", "order": [301.0, None], "track": 1, "sec": 301.0},  # 상한 넘음
        ]
        for b in bad:
            with self.assertRaises(AppError):
                vb._clean(b)

    def test_retire_wait_widened(self):
        """대전 바탕(단계 0) — 한 사람만 들어온 1:1 판은 「첫 결승 + 10초」(0.5초 여유)부터 받는다. 지금 화면(12초)도 그대로."""
        self.assertEqual(vb.RETIRE_SEC, 10)
        self.assertEqual(vb.GRACE_SEC, 12)  # 늦게 들어온 사람 기록 허용 폭은 그대로(좁히지 않음)
        self.assertEqual(vb.MIN_FINISH, (99, 103, 99, 99, 100, 99, 99, 99, 106, 99, 99, 99, 102))  # 이 단계에서 건드리지 않음
        first = 140.0

        def one(sec, who="host", track=1, t=first):
            order = [t, None] if who == "host" else [None, t]
            return vb._clean({"winner": who, "order": order, "track": track, "sec": sec})

        for extra in (10.0, 9.5, 10.02, 12.0, 12.04, 20.0):  # 10초 · 경계(0.5 여유) · 소수 · 지금 화면 12초 · 넉넉히
            self.assertEqual(one(first + extra)["order"], [first, None], extra)
            self.assertEqual(one(first + extra, "guest")["winner"], "guest", extra)
        for extra in (9.0, 9.49, 5.0, 0.0):
            with self.assertRaises(AppError, msg=str(extra)):
                one(first + extra)
            with self.assertRaises(AppError, msg=str(extra)):
                one(first + extra, "guest")
        # 5분 상한 가까이 들어오면 300초에 끝나도 받는다(299.5 부터)
        self.assertEqual(one(300.0, t=294.0)["sec"], 300.0)
        self.assertEqual(one(299.5, t=294.0)["sec"], 299.5)
        with self.assertRaises(AppError):
            one(299.4, t=294.0)
        # 옛 정상 기록(낮추지 않은 MIN_FINISH) — 가장 빠른 허용 기록 · 둘 다 들어온 판 · 12초 안 늦게 들어옴
        self.assertEqual(vb._clean({"winner": "host", "order": [99.0, 111.5], "track": 1, "sec": 111.5})["order"], [99.0, 111.5])
        self.assertEqual(vb._clean({"winner": "guest", "order": [None, 106.0], "track": 9, "sec": 116.0})["winner"], "guest")
        with self.assertRaises(AppError):
            vb._clean({"winner": "host", "order": [130.0, 143.0], "track": 1, "sec": 143.0})  # 늦은 쪽 13초 — 그대로 거절

    def test_retire_result_judged(self):
        """「첫 결승 + 10초」 결과를 두 사람이 같이 보내면 FINISH(도장 · 순위에 셈) — 판정 규칙은 그대로."""
        from datetime import datetime, timezone
        from types import SimpleNamespace

        m = SimpleNamespace(challenger_id=11, opponent_id=22, state=None, end_reason=None, status="ACTIVE")
        m.state = vb.start(m, (11, 22), None)
        m.state["at"] -= 200 * 1000  # 수락 200초 뒤
        now = datetime.now(timezone.utc)
        r = {"winner": "guest", "order": [None, 131.4], "track": 4, "sec": 141.4}
        self.assertIsNone(vb.act(m, 11, dict(r), now))
        win, reason = vb.act(m, 22, dict(r), now)
        self.assertEqual((win, reason), (22, "FINISH"))
        m.end_reason = reason
        self.assertTrue(vb.counts(m))

    def test_retire_1a_farther_resign(self):
        """단계 1a — 결과 형식은 그대로: 아무도 못 들어온 판은 FARTHER(셈), 기권은 상대 승이지만 안 셈, 10초 끝 판은 FINISH(셈)."""
        from datetime import datetime, timezone
        from types import SimpleNamespace

        now = datetime.now(timezone.utc)

        def race(r):
            m = SimpleNamespace(challenger_id=11, opponent_id=22, state=None, end_reason=None, status="ACTIVE")
            m.state = vb.start(m, (11, 22), None)
            m.state["at"] -= 320 * 1000
            self.assertIsNone(vb.act(m, 11, dict(r), now))
            out = vb.act(m, 22, dict(r), now)
            m.end_reason = out[1]
            return out, vb.counts(m)

        # 5분 안에 아무도 못 들어옴 — 더 멀리 간 쪽 승(FARTHER)
        self.assertEqual(race({"winner": "guest", "order": [None, None], "dist": [0.81, 0.86], "track": 2, "sec": 300.0}), ((22, "FARTHER"), True))
        # 첫 결승 + 10초에 끝(못 들어온 쪽 null) — FINISH, 도장 · 순위에 셈
        self.assertEqual(race({"winner": "host", "order": [128.2, None], "dist": [1, 0.97], "track": 7, "sec": 138.2}), ((11, "FINISH"), True))
        # 기권 — 상대 승이지만 도장 · 순위에는 안 셈(그대로)
        m = SimpleNamespace(end_reason="RESIGN")
        self.assertFalse(vb.counts(m))

    def test_party_no_wait_check(self):
        """여러 명(party._clean)은 결승 대기 검사가 없다 — 첫 결승 + 10초에 끝난 판도 받는다(넓히기만, 바꿀 것 없음)."""
        r = party._clean({"winner": 0, "order": [140.0, None, None, None, None, None], "dist": [1, 0.9, 0.8, 0.7, 0.6, 0.5], "track": 1, "sec": 150.0}, 6, 0)
        self.assertEqual(r["winner"], 0)

    def test_stage3_start_dash_min_finish(self):
        """단계 3(출발 대시 · 브레이크 · 제자리로) — 최고 속도는 그대로라 MIN_FINISH 를 바꾸지 않는다.

        출발 대시는 출발 때 부스트(최대 1.1초)를 한 번 더 받는 것뿐 — MIN_FINISH 는 「부스트를 내내 받아도 못 넘는 속도 65」로
        정한 값이라 그대로 둔다. 화면 쪽 값(최고 45 · 부스트 × 1.3 = 58.5 < 65)과 13 트랙 자동 완주 실측(출발 대시 포함 ·
        내 차 부스트를 내내 켠 판)이 모두 MIN_FINISH 보다 느린지 확인한다(실측은 sundown-impl4 handoff-3 참고).
        """
        import pathlib
        import re

        body = (pathlib.Path(__file__).resolve().parents[2] / "web/games/embed/sundown.html").read_text(encoding="utf-8")
        base = re.search(r"function baseStats\(\)\{return \{vmax:(\d+(?:\.\d+)?),acc:\d+,hand:\d+,driftRate:[\d.]+,boostMul:([\d.]+),", body)
        self.assertIsNotNone(base)
        top = float(base.group(1)) * float(base.group(2))
        self.assertLess(top, 65)  # 대전은 모두 기본 성능 — 부스트 중 최고 속도도 MIN_FINISH 기준 속도 아래
        dash_max = float(re.search(r"DASH_MAX=([\d.]+)", body).group(1))
        self.assertLessEqual(dash_max, 1.1)  # 출발 대시 = 부스트 1.1초 이하(최고 속도를 올리지 않음)
        self.assertIn("dur=Math.min(DASH_MAX,dur);c.boostT=Math.max(c.boostT,dur);", body)
        self.assertEqual(vb.MIN_FINISH, (99, 103, 99, 99, 100, 99, 99, 99, 106, 99, 99, 99, 102))  # 넓히지도 좁히지도 않음
        self.assertEqual(party.MIN_FINISH, vb.MIN_FINISH)
        # 13 트랙 실측 최고 기록(초) — 자동 운전 · 어려움 컴퓨터 · 출발 대시 포함(혼자 하기는 컴퓨터가 고무줄로 더 빠를 수 있음)
        measured = (134.7, 139.47, 134.32, 131.07, 127.32, 128.75, 125.67, 129.13, 125.47, 125.47, 107.92, 122.18, 118.93)
        for lo, best in zip(vb.MIN_FINISH, measured):
            self.assertLess(lo, best)


if __name__ == "__main__":
    unittest.main()
