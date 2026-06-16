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

location = / {
    return 301 /index;
}

location / {
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

# 구 admin 한글 경로 → 영문 URL
location = /관리자/로그인.html { return 301 /admin/login; }
location = /관리자/대시보드.html { return 301 /admin/dashboard; }
location = /관리자/예약관리.html { return 301 /admin/reservations; }
location = /관리자/신청자상세.html { return 301 /admin/applicant; }
location = /관리자/재신청메일.html { return 301 /admin/reapply-mail; }
location = /관리자/휴가관리.html { return 301 /admin/vacation; }
location = /관리자/운영설정.html { return 301 /admin/settings; }

# admin .html 확장자 없이 접근
location = /admin/login.html { return 301 /admin/login; }
location = /admin/dashboard.html { return 301 /admin/dashboard; }
location = /admin/reservations.html { return 301 /admin/reservations; }
location = /admin/applicant.html { return 301 /admin/applicant; }
location = /admin/reapply-mail.html { return 301 /admin/reapply-mail; }
location = /admin/vacation.html { return 301 /admin/vacation; }
location = /admin/settings.html { return 301 /admin/settings; }

location /_ds/ {
    expires 7d;
    add_header Cache-Control "public, immutable";
}

location /assets/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
