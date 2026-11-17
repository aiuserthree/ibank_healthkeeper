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


if __name__ == "__main__":
    unittest.main()
