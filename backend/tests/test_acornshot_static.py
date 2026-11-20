"""Acornshot arcade registration and local runtime dependency contract (no DB)."""
import pathlib
import re
import unittest

from app.services import game

ROOT = pathlib.Path(__file__).resolve().parents[2]


class AcornshotIntegrationTest(unittest.TestCase):
    def test_registration_and_frame(self):
        entry = game.GAMES['acornshot']
        self.assertLess(list(game.GAMES).index('acornshot'), list(game.GAMES).index('ferry'))  # 달나라 대포는 대전과 짝으로 맨 위 — 먼저 나온 통통배보다 위인지만 본다
        self.assertEqual(entry.category, 'MINI')
        self.assertFalse(entry.lower_better)
        frame = (ROOT / 'web/games/acornshot.html').read_text()
        self.assertIn(f'<title>{entry.title} — 아케이드</title>', frame)
        self.assertIn('key: "acornshot"', frame)
        self.assertIn('wide: true', frame)
        self.assertIn('src: "/games/embed/acornshot.html?hk=1"', frame)
        physics = (ROOT / 'web/games/embed/acornshot/physics.js').read_text()
        self.assertEqual(int(re.search(r'SCORE_MAX = (\d+)', physics)[1]), entry.max_score)

    def test_runtime_dependencies_exist(self):
        page = ROOT / 'web/games/embed/acornshot.html'
        for src in re.findall(r'(?:src|href)="([^"]+)"', page.read_text()):
            self.assertNotIn('://', src)
            self.assertTrue((page.parent / src).is_file(), src)
        scripts = re.findall(r'<script src="([^"]+)"', page.read_text())
        self.assertEqual(scripts, ['acornshot/vendor/matter.min.js', 'acornshot/levels.js', 'acornshot/physics.js', 'acornshot/game.js'])
        css = (page.parent / 'acornshot/style.css').read_text()
        for path in re.findall(r"url\('([^']+)'\)", css):
            self.assertTrue((ROOT / 'web' / path.lstrip('/')).is_file(), path)
        # Generated pictures: same-site files only (the game falls back to canvas drawing without them).
        js = (page.parent / 'acornshot/game.js').read_text()
        self.assertIn("ART_BASE = '../../assets/games/acornshot/'", js)
        art = ROOT / 'web/assets/games/acornshot'
        names = ['title', 'acorn-seed', 'acorn-bomb', 'acorn-split', 'goblin', 'goblin-hurt', 'sling'] + [f'bg-{p}' for p in ('forest', 'valley', 'swamp', 'snow', 'castle')]
        for name in names:
            self.assertIn(f"'{name}'" if not name.startswith('bg-') else "'bg-' + placeKey", js)
            self.assertTrue((art / f'{name}.webp').is_file(), name)
        first = sum((art / f'{n}.webp').stat().st_size for n in names[:7])
        self.assertLess(first, 1_500_000, 'pictures fetched before the first screen stay under 1.5MB')

    def test_embed_messages_and_gallery(self):
        js = (ROOT / 'web/games/embed/acornshot/game.js').read_text()
        for sig in ('ready', 'start', 'live', 'score', 'pause', 'resume', 'paused', 'resumed', 'restart', 'hello', 'esc'):
            self.assertIn(f'hk:{sig}', js)
        self.assertIn('e.source !== parent', js)
        self.assertIn('e.origin !== location.origin', js)
        self.assertIn('postMessage({ type, ...extras }, location.origin)', js)
        self.assertIn('acornshot: "퍼즐"', (ROOT / 'web/arcade.html').read_text())
        self.assertIn('acornshot: [', (ROOT / 'web/_shared/play.js').read_text())
        thumb = ROOT / 'web/assets/lounge/acornshot.jpg'
        self.assertTrue(thumb.is_file())
        self.assertEqual(thumb.read_bytes()[:2], b'\xff\xd8')


if __name__ == '__main__':
    unittest.main()
