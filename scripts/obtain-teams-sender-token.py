#!/usr/bin/env python3
"""healthkeeper@ refresh token 발급 — 브라우저 code 자동 수신.

사용법:
  1) ./scripts/dev.sh 가 켜져 있으면 Ctrl+C 로 끄기 (code 중복 사용 방지)
  2) python3 scripts/obtain-teams-sender-token.py
  3) 브라우저에서 healthkeeper@ 로그인
  4) 터미널에 출력된 TEAMS_SENDER_REFRESH_TOKEN 을 .env 에 추가

Azure 앱 등록 리디렉션 URI에 아래가 있어야 합니다:
  http://127.0.0.1:8847/callback
"""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402

CALLBACK_PORT = 8847
REDIRECT_URI = f"http://127.0.0.1:{CALLBACK_PORT}/callback"
SCOPE = "Chat.Create ChatMessage.Send offline_access"


def _load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        print("Missing .env")
        sys.exit(1)
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _exchange_code(code: str) -> dict:
    import httpx

    settings = get_settings()
    url = f"https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0/token"
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.entra_client_id,
        "client_secret": settings.entra_client_secret,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPE,
    }
    transport = httpx.HTTPTransport(local_address="0.0.0.0", retries=0)
    with httpx.Client(timeout=30.0, transport=transport) as client:
        resp = client.post(url, data=data)
    try:
        return resp.json()
    except json.JSONDecodeError:
        return {"error": "invalid_response", "error_description": resp.text[:500]}


def main() -> int:
    _load_env()
    settings = get_settings()
    if not settings.sso_ready():
        print("ENTRA_TENANT_ID / CLIENT_ID / CLIENT_SECRET 를 .env 에 설정하세요.")
        return 1

    sender = settings.teams_sender_email or "healthkeeper@ibank.co.kr"
    result: dict[str, str] = {}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            params = dict(urllib.parse.parse_qsl(parsed.query))
            if "error" in params:
                result["error"] = params.get("error_description") or params["error"]
            else:
                result["code"] = params.get("code", "")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                b"<html><body><h2>OK</h2><p>Teams token setup complete. You can close this tab.</p></body></html>"
            )
            done.set()

        def log_message(self, *_args) -> None:
            return

    server = HTTPServer(("127.0.0.1", CALLBACK_PORT), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    params = urllib.parse.urlencode(
        {
            "client_id": settings.entra_client_id,
            "response_type": "code",
            "redirect_uri": REDIRECT_URI,
            "response_mode": "query",
            "scope": SCOPE,
            "login_hint": sender,
        }
    )
    auth_url = (
        f"https://login.microsoftonline.com/{settings.entra_tenant_id}"
        f"/oauth2/v2.0/authorize?{params}"
    )

    print("=" * 46)
    print(" Teams refresh token setup")
    print("=" * 46)
    print()
    print(f"1) dev server(dev.sh)가 켜져 있으면 먼저 끄세요.")
    print(f"2) Azure redirect URI: {REDIRECT_URI}")
    print(f"3) 브라우저에서 {sender} 로 로그인")
    print()
    print("Opening browser...")
    print(auth_url)
    print()
    webbrowser.open(auth_url)

    if not done.wait(timeout=180):
        print("TIMEOUT: 3분 안에 로그인/동의가 완료되지 않았습니다.")
        server.shutdown()
        return 1

    server.shutdown()

    if result.get("error"):
        print(f"ERROR: {result['error']}")
        return 1
    code = result.get("code", "")
    if not code:
        print("ERROR: authorization code 를 받지 못했습니다.")
        return 1

    print("Exchanging code for refresh token...")
    token = _exchange_code(code)
    refresh = token.get("refresh_token")
    if not refresh:
        print("ERROR: refresh token exchange failed")
        print(json.dumps(token, indent=2, ensure_ascii=False))
        return 1

    print()
    print("Success. Add to .env:")
    print()
    print(f"TEAMS_SENDER_EMAIL={sender}")
    print(f"TEAMS_SENDER_REFRESH_TOKEN={refresh}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
