"""Looseends arcade registration and local runtime dependency contract (no DB)."""
import pathlib
import re
import unittest

from app.services import game

ROOT = pathlib.Path(__file__).resolve().parents[2]


class LooseendsIntegrationTest(unittest.TestCase):
    def test_registration_and_frame(self):
        entry = game.GAMES['looseends']
        self.assertEqual(next(iter(game.GAMES)), 'looseends')
        self.assertEqual(entry.category, 'MINI')
        self.assertFalse(entry.lower_better)
        frame = (ROOT / 'web/games/looseends.html').read_text()
        self.assertIn(f'<title>{entry.title} — 아케이드</title>', frame)
        self.assertIn('key: "looseends"', frame)
        self.assertIn('wide: true', frame)
        self.assertIn('src: "/games/embed/looseends.html?hk=1"', frame)
        js = (ROOT / 'web/games/embed/looseends/game.js').read_text()
        self.assertEqual(int(re.search(r'SCORE_MAX = (\d+)', js)[1]), entry.max_score)

    def test_runtime_dependencies_exist(self):
        page = ROOT / 'web/games/embed/looseends.html'
        for src in re.findall(r'(?:src|href)="([^"]+)"', page.read_text()):
            self.assertNotIn('://', src)
            self.assertTrue((page.parent / src).is_file(), src)

    def test_embed_messages_and_gallery(self):
        js = (ROOT / 'web/games/embed/looseends/game.js').read_text()
        for sig in ('ready', 'start', 'live', 'score', 'resumed', 'paused', 'esc'):
            self.assertIn(f'hk:{sig}', js)
        self.assertIn('e.source !== parent', js)
        self.assertIn('e.origin !== location.origin', js)
        self.assertIn('postMessage({ type, ...extras }, location.origin)', js)
        self.assertIn('looseends: "퍼즐"', (ROOT / 'web/arcade.html').read_text())
        self.assertIn('looseends: [', (ROOT / 'web/_shared/play.js').read_text())
        thumb = ROOT / 'web/assets/lounge/looseends.jpg'
        self.assertTrue(thumb.is_file())
        self.assertEqual(thumb.read_bytes()[:2], b'\xff\xd8')


if __name__ == '__main__':
    unittest.main()
