root /opt/healthkeeper/app/web;
index index.html;
client_max_body_size 10m;

location /api/ {
    proxy_pass http://127.0.0.1:8100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 30s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
}

# 1:1 실시간 연결(웹소켓) — /api/ 보다 긴 접두어라 이쪽이 먼저 잡는다. 판이 이어지는 동안 오래 열려 있어 읽기 시간을 길게 둔다
# (서버가 20초마다 ping 을 보내므로 살아 있는 연결은 끊기지 않는다)
# - 압축(permessage-deflate) 요청을 넘기지 않는다: 작은 압축 프레임이 서버에서 크게 풀려 메모리를 먹는 것을 막는다(메시지는 4KB 이하라 압축이 필요 없다)
# - Host 는 포트까지 그대로 넘긴다: 서버가 Origin 전체(scheme · host · port)를 이 사이트 주소와 맞춰 본다
# - 거절 이유 묻기(/api/play/rt-check/)는 접두어가 달라 위의 /api/ 가 맡는다
location /api/play/rt/ {
    proxy_pass http://127.0.0.1:8100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Sec-WebSocket-Extensions "";
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_connect_timeout 30s;
    proxy_send_timeout 3600s;
    proxy_read_timeout 3600s;
}

location = /favicon.ico {
    alias /opt/healthkeeper/app/web/assets/logo-mark.svg;
    default_type image/svg+xml;
    expires 30d;
    add_header Cache-Control "public, immutable";
}

location = / {
    return 301 /index;
}

# 예전 메인 배너 링크 → 라운지 안으로 옮긴 별까지 계단
location = /go/stairs {
    add_header Cache-Control "no-store";
    return 302 /games/stairs;
}

# 아케이드 옛 주소(라운지) → 새 주소
location ~ ^/lounge(\.html)?$ {
    add_header Cache-Control "no-store";
    return 301 /arcade;
}

# 아직 비공개 — 함께하기 · 새 대전 · 협동 게임 화면은 운영에서 열지 않고 아케이드로 보낸다(로컬 개발 서버에서만 보임)
# 공개할 때 이 블록을 지우고 backend/app/services/game.py LOCAL_ONLY_GAMES 도 함께 정리한다
location ~ ^/(together|games/(baseball|boxes|quizduel|gostop|memory|soccer|volley|escape|kitchen|words|maze|sketch|sync|spotdiff))(\.html)?/?$ {
    add_header Cache-Control "no-store";
    return 302 /arcade;
}

# HTML·페이지 스크립트는 매번 재검증 — 배포 직후 로그인 리다이렉트 등에서 옛 페이지가 캐시로 뜨지 않게 함
location / {
    add_header Cache-Control "no-cache, must-revalidate";
    try_files $uri $uri/ $uri.html =404;
}

# 구 한글 경로 → 영문 URL
location = /사용자/index.html { return 301 /index; }
location = /사용자/로그인.html { return 301 /login; }
location = /사용자/회원가입.html { return 301 /signup; }
location = /사용자/예약하기.html { return 301 /reserve; }
location = /사용자/재신청.html { return 301 /reapply; }
location = /사용자/마이페이지-예약내역.html { return 301 /mypage; }
location = /사용자/마이페이지-내정보.html { return 301 /profile; }

# .html 확장자 없이 접근
location = /index.html { return 301 /index; }
location = /login.html { return 301 /login; }
location = /signup.html { return 301 /signup; }
location = /reserve.html { return 301 /reserve; }
location = /reapply.html { return 301 /reapply; }
location = /mypage.html { return 301 /mypage; }
location = /profile.html { return 301 /profile; }
location = /notice.html { return 301 /notice; }
location = /health.html { return 301 /health; }

# 구 admin 한글 경로 → 영문 URL
location = /관리자/로그인.html { return 301 /admin/login; }
location = /관리자/대시보드.html { return 301 /admin/dashboard; }
location = /관리자/예약관리.html { return 301 /admin/reservations; }
location = /관리자/신청자상세.html { return 301 /admin/applicant; }
location = /관리자/재신청메일.html { return 301 /admin/reapply-mail; }
location = /관리자/휴가관리.html { return 301 /admin/vacation; }
location = /관리자/운영설정.html { return 301 /admin/settings; }

# /admin 으로 들어오면 대시보드로 (로그인 안 되어 있으면 대시보드가 로그인 화면으로 보냄)
location = /admin { return 302 /admin/dashboard; }
location = /admin/ { return 302 /admin/dashboard; }

# admin .html 확장자 없이 접근
location = /admin/login.html { return 301 /admin/login; }
location = /admin/dashboard.html { return 301 /admin/dashboard; }
location = /admin/reservations.html { return 301 /admin/reservations; }
location = /admin/applicant.html { return 301 /admin/applicant; }
location = /admin/reapply-mail.html { return 301 /admin/reapply-mail; }
location = /admin/vacation.html { return 301 /admin/vacation; }
location = /admin/settings.html { return 301 /admin/settings; }

location /_shared/ {
    add_header Cache-Control "no-cache, must-revalidate";
}

location /_ds/ {
    expires 7d;
    add_header Cache-Control "public, immutable";
}

location /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
