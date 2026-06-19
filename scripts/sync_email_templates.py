#!/usr/bin/env python3
"""export/이메일 bundler HTML → web/이메일 (export 레이아웃 동일 유지)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
EXPORT_DIR = ROOT / "export" / "이메일"
HANDOFF_DIR = ROOT / "docs" / "design" / "handoff" / "project" / "export" / "이메일"
WEB_DIR = ROOT / "web" / "이메일"
PREVIEW_DIR = WEB_DIR / "preview"

MAIL_MAP = {
    "01-이메일인증.html": HANDOFF_DIR / "01-이메일인증.html",
    "02-예약완료-일반.html": EXPORT_DIR,
    "03-예약완료-재신청.html": EXPORT_DIR,
    "04-탈락-재신청안내.html": EXPORT_DIR,
}


def extract_bundler_html(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    m = re.search(
        r'<script type="__bundler/template">\s*\n(".*?")\s*\n\s*</script>',
        text,
        re.S,
    )
    if not m:
        raise ValueError(f"no bundler template in {path}")
    return json.loads(m.group(1))


def find_export_file(prefix: str, directory: Path) -> Path:
    for p in sorted(directory.glob("*.html")):
        if p.name.startswith(prefix[:2]):
            return p
    raise FileNotFoundError(prefix)


def logo_data_uri() -> str:
    svg = (ROOT / "web" / "assets" / "logo-lockup.svg").read_text(encoding="utf-8")
    return "data:image/svg+xml," + quote(svg)


def logo_img_tag() -> str:
    return f'<img src="{logo_data_uri()}" alt="헬스키퍼"'


def fix_logo(html: str) -> str:
    tag = logo_img_tag()
    html = re.sub(r'<img src="[0-9a-f-]{36}" alt="헬스키퍼"', tag, html)
    return html.replace('<img src="/assets/logo-lockup.svg" alt="헬스키퍼"', tag)


def fix_links(html: str, reapply: bool = False) -> str:
    href = "/reapply" if reapply else "/mypage"
    return html.replace('href="#"', f'href="{href}"')


def wrap_intro(html: str) -> str:
    html = re.sub(
        r"(<h1[^>]*>[^<]+</h1>\s*)((?:<p[^>]*>.*?</p>\s*)+)",
        r"\1<!--HK_INTRO-->\n\2<!--HK_INTRO_END-->",
        html,
        count=1,
        flags=re.S,
    )
    html = html.replace("김민수님", "{이름}님")
    html = html.replace("김민수", "{이름}")
    return html


def fix_02(html: str) -> str:
    html = fix_logo(html)
    html = wrap_intro(html)
    html = re.sub(r">6월 23일 \(화\)<", ">{날짜}<", html)
    html = re.sub(r">15:30 – 16:00 ", ">{시간} ", html)
    html = fix_links(html)
    tips_html = (
        "<!--HK_TIPS-->\n"
        "          · 일반 신청 취소는 <strong style=\"color:#0b3558;\">마감(수요일 17:00) 전까지</strong> "
        "가능합니다. 마감 이후에는 취소할 수 없습니다.<br>\n"
        "          · 부득이한 사정으로 방문이 어려우면 마이페이지에서 미리 취소해 주세요.\n"
        "          <!--HK_TIPS_END-->"
    )
    html = re.sub(
        r"(<tr><td style=\"padding:20px 40px 40px;\">\s*"
        r"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
        r"style=\"background:#f8f9fb; border-radius:8px;\">\s*"
        r"<tbody><tr><td style=\"padding:16px 18px; font-size:13\.5px; line-height:1\.7; color:#476788;\">)"
        r".*?"
        r"(</td></tr>\s*</tbody></table>\s*</td></tr>\s*"
        r"<tr><td style=\"padding:22px 40px; background:#0b3558;\">)",
        r"\1" + tips_html + r"\2",
        html,
        count=1,
        flags=re.S,
    )
    return html


def fix_03(html: str) -> str:
    html = fix_logo(html)
    html = wrap_intro(html)
    html = re.sub(r">6월 25일 \(목\)<", ">{날짜}<", html)
    html = re.sub(r">14:30 – 15:00 ", ">{시간} ", html)
    html = fix_links(html)
    html = re.sub(
        r"(<td style=\"padding:16px 18px 16px 0; font-size:14px; line-height:1\.6; color:#0b3558;\">)\s*"
        r"<strong>.*?</strong><br>\s*"
        r"<span style=\"color:#476788;\">.*?</span>\s*"
        r"(</td>)",
        r"\1<!--HK_WARN-->\n            <strong>재신청 건은 취소할 수 없습니다.</strong><br>\n"
        r"            <span style=\"color:#476788;\">선착순으로 즉시 확정되는 예약이므로 확정 후 변경·취소가 불가합니다.</span>\n"
        r"            <!--HK_WARN_END-->\2",
        html,
        count=1,
        flags=re.S,
    )
    return html


def fix_04(html: str) -> str:
    html = fix_logo(html)
    html = wrap_intro(html)
    html = re.sub(
        r"(<p style=\"margin:0 0 12px; font-size:13px; font-weight:700; color:#004eba; letter-spacing:0\.02em;\">비어있는 슬롯</p>\s*)"
        r"(?:<span style=\"display:inline-block;[^>]+>[^<]+</span>\s*)+",
        r"\1{빈슬롯목록Html}\n          ",
        html,
        count=1,
        flags=re.S,
    )
    html = fix_links(html, reapply=True)
    tips_html = (
        "<!--HK_TIPS-->\n"
        "          · 재신청 마감: <strong>{재신청마감}</strong>까지<br>\n"
        "          · 재신청은 <strong>선착순으로 즉시 확정</strong>되며, <strong>취소할 수 없습니다.</strong><br>\n"
        "          · 이미 확정된 슬롯은 <strong>“이미 예약이 완료된 날짜 및 시간대입니다.”</strong> "
        "안내와 함께 거절될 수 있습니다.\n"
        "          <!--HK_TIPS_END-->"
    )
    html = re.sub(
        r"(<!-- 규칙 -->\s*<tr><td style=\"padding:20px 40px 40px;\">\s*"
        r"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
        r"style=\"background:#fbf0db; border-radius:8px;\">\s*"
        r"<tbody><tr><td style=\"padding:16px 18px; font-size:13\.5px; line-height:1\.8; color:#0b3558;\">)"
        r".*?"
        r"(</td></tr>\s*</tbody></table>\s*</td></tr>\s*"
        r"<tr><td style=\"padding:22px 40px; background:#0b3558;\">)",
        r"\1" + tips_html + r"\2",
        html,
        count=1,
        flags=re.S,
    )
    return html


def fix_01(html: str) -> str:
    html = fix_logo(html)
    html = re.sub(
        r"(<h1[^>]*>이메일 인증코드 안내</h1>\s*)((?:<p[^>]*>.*?</p>\s*)+)",
        r"\1<!--HK_INTRO-->\n\2<!--HK_INTRO_END-->",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r"(<p style=\"margin:0; font-size:40px; line-height:1; font-weight:700; letter-spacing:14px; color:#0b3558; padding-left:14px;\">)\d+(</p>)",
        r"\1{인증코드}\2",
        html,
    )
    html = re.sub(
        r"(<tr><td style=\"padding:20px 40px 40px;\">\s*"
        r"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" "
        r"style=\"background:#fbf0db; border-radius:8px;\">\s*"
        r"<tbody><tr><td style=\"padding:16px 18px; font-size:13\.5px; line-height:1\.7; color:#0b3558;\">)"
        r".*?"
        r"(</td></tr>\s*</tbody></table>\s*</td></tr>\s*"
        r"<!-- 푸터 -->)",
        r"\1<!--HK_TIPS-->\n          · 인증코드는 발송 후 <strong>5분 동안</strong> 유효합니다.<br>\n          · 코드가 만료되었다면 회원가입 화면에서 <strong>재발송</strong>을 눌러 새 코드를 받아 주세요.<br>\n          · 본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.\n          <!--HK_TIPS_END-->\2",
        html,
        count=1,
        flags=re.S,
    )
    return html


FIXERS = {
    "01-이메일인증.html": fix_01,
    "02-예약완료-일반.html": fix_02,
    "03-예약완료-재신청.html": fix_03,
    "04-탈락-재신청안내.html": fix_04,
}


PREVIEW_LINK_SCRIPT = (
    '<script>(function(){document.addEventListener("click",function(e){'
    'var a=e.target.closest("a[href]");if(!a)return;var raw=a.getAttribute("href");'
    'if(!raw||raw.charAt(0)!=="/")return;e.preventDefault();'
    'var top=window.top||window;top.open(top.location.origin+raw,"_blank","noopener,noreferrer");'
    '},true);})();</script>'
)


def wrap_preview_intro(html: str) -> str:
    """미리보기용 HK_INTRO 마커 (샘플 이름·날짜는 export 그대로)."""
    return re.sub(
        r"(<h1[^>]*>[^<]+</h1>\s*)((?:<p[^>]*>.*?</p>\s*)+)",
        r"\1<!--HK_INTRO-->\n\2<!--HK_INTRO_END-->",
        html,
        count=1,
        flags=re.S,
    )


def fix_preview(html: str, *, reapply: bool = False) -> str:
    """export 원본 그대로 — 로고(data URI)·링크·HK_INTRO 마커 (미리보기 전용)."""
    html = fix_links(fix_logo(html), reapply=reapply)
    html = wrap_preview_intro(html)
    if "</body>" in html:
        html = html.replace("</body>", PREVIEW_LINK_SCRIPT + "</body>")
    return html


PREVIEW_FIXERS = {
    "01-이메일인증.html": lambda h: fix_preview(h),
    "02-예약완료-일반.html": lambda h: fix_preview(h),
    "03-예약완료-재신청.html": lambda h: fix_preview(h),
    "04-탈락-재신청안내.html": lambda h: fix_preview(h, reapply=True),
}


def main() -> int:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for out_name, src in MAIL_MAP.items():
        if isinstance(src, Path) and src.is_dir():
            src_path = find_export_file(out_name, src)
        else:
            src_path = Path(src)
        raw = extract_bundler_html(src_path)
        html = FIXERS[out_name](raw)
        (WEB_DIR / out_name).write_text(html, encoding="utf-8")
        preview_html = PREVIEW_FIXERS[out_name](raw)
        (PREVIEW_DIR / out_name).write_text(preview_html, encoding="utf-8")
        print(f"wrote {out_name} ({len(html)} bytes) + preview ({len(preview_html)} bytes) from {src_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
