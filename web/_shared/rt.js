// 1:1 실시간 연결 — 대전 한 판의 두 사람 브라우저가 서버(/api/play/rt/{판 id})를 거쳐 짧은 메시지를 주고받는다.
// 실시간 게임(서버 REALTIME_GAMES)만 열린다. 끊기면 알아서 다시 붙는다(점점 길게 기다림). 판이 진행 중(ACTIVE)일 때만 열린다.
//
//   const rt = HKRt.connect(matchId, {
//     onHello({ role, peerHere }),   붙을 때마다(다시 붙어도). role: "host"(도전한 사람) · "guest"(받은 사람)
//                                    → 다시 붙었을 수 있으니 host 는 전체 상태를 다시 보내면 된다
//     onPeer(here),                  here 는 true/false(객체 아님). 상대가 들어옴(true) · 나감(false).
//                                    상대가 다시 붙어도 true 가 또 온다 → 전체 상태를 다시 보내면 된다. false 는 잠깐 끊긴 것일 수도 있다
//     onMessage(msg),                상대가 send 한 객체 — msg.from === "peer"
//     onClose({ code, reason, final, text }),  끊길 때마다 온다. ★ final 일 때만 끝 — 아니면 알아서 다시 붙는 중이다(「다시 연결하는 중」만 보여 주기)
//                                    text: 화면에 띄울 말 · reason: 서버가 알린 이유("REPLACED" 등)
//     onStatus(state),               "connecting" · "open" · "retry" · "closed"
//     onError(code),                 서버가 내 메시지를 버렸을 때 — "TOO_BIG" · "BAD_MESSAGE" · "RATE_LIMIT"
//     url,                           (개발용) 주소를 직접 줄 때. 예: "ws://localhost:8100/api/play/rt/12"
//     checkUrl,                      (개발용) 거절 이유를 물을 주소. 안 주면 url 에서 만든다(/api/play/rt-check/{id}), null 이면 묻지 않음
//   });
//   rt.send(obj) → true/false        보냈으면 true. false 면 안 보낸 것이다 — 한 번뿐인 일(득점 등)은 다음 상태에도 넣어 다시 맞추기.
//                                    열려 있을 때만 · 4KB 이하 JSON 객체 · "sys" 키는 못 씀(서버용) · 초당 120개까지 · 망이 막혀 64KB 넘게 쌓였으면 false
//   rt.close()                       그만 붙는다 (onClose({ final: true }) 가 온다)
//   rt.open · rt.role · rt.peerHere · rt.rtt(왕복 ms, 모르면 null) · rt.state · rt.buffered(아직 못 보낸 바이트)
//
// 서버가 닫는 코드: 4401 로그인 필요 · 4403 들어갈 수 없음 · 4404 판 없음 · 4408 다른 창에서 엶 · 4409 진행 중인 판 아님
//   → 4400~4499 는 다시 붙지 않는다(final). 그 밖(서버 재시작 · 망 끊김 · 4000 오래 조용함 · 대답 없음)은 다시 붙는다.
//   서버는 들어올 수 없는 연결을 받기 전에 끊는다(브라우저에는 이유 없이 끊김) → 이때는 rt-check 로 이유를 물어 final 인지 정한다.
window.HKRt = (function () {
  const MAX_BYTES = 4096;
  const RATE = 120;            // 초당 보낼 수 있는 메시지 수 (서버는 150 — 망에서 몰려 도착해도 버려지지 않게 여유를 둔다)
  const BURST = 120;           // 한꺼번에 보낼 수 있는 개수
  const MAX_BUFFERED = 65536;  // 아직 못 보낸 바이트가 이만큼 넘으면 send 를 거절 (망이 막힘 — 더 쌓아 봐야 늦게 몰려 간다)
  const CONNECT_MS = 10000;    // 붙기 시작해서 hello 까지 이만큼 걸리면 버리고 다시 붙는다
  const PING_MS = 15000;       // 왕복 시간 재기 겸 살아 있다고 알리기
  const DEAD_MS = 45000;       // 이만큼 아무것도 안 오면 끊긴 것으로 보고 다시 붙는다 (서버는 20초마다 ping)
  const PROBE_MS = 5000;       // 화면이 다시 보이거나 망이 돌아왔을 때 ping 대답을 기다리는 시간
  const CHECK_MS = 5000;       // 거절 이유 묻기 기다리는 시간
  const BACKOFF = [500, 1000, 2000, 4000, 8000];
  const MAX_WAIT = 10000;

  const CLOSE_TEXT = {
    4401: "로그인이 필요해요.",
    4403: "이 판에 들어갈 수 없어요.",
    4404: "판을 찾을 수 없어요.",
    4408: "다른 창에서 이 판을 열어서 여기는 닫았어요.",
    4409: "진행 중인 판이 아니에요.",
  };
  // 서버가 알리는 이유 → 닫는 코드
  const REASON_CODES = {
    UNAUTHORIZED: 4401,
    FORBIDDEN: 4403,
    MATCH_NOT_FOUND: 4404,
    REPLACED: 4408,
    MATCH_NOT_ACTIVE: 4409,
    IDLE: 4000,
  };

  function isFinal(code) {
    return code >= 4400 && code <= 4499;
  }

  function closeText(code, final) {
    if (CLOSE_TEXT[code]) return CLOSE_TEXT[code];
    return final ? "연결을 닫았어요." : "연결이 끊겼어요. 다시 연결하고 있어요.";
  }

  function byteLength(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function call(fn, ...args) {
    if (typeof fn !== "function") return;
    try {
      fn(...args);
    } catch (err) {
      console.error("[HKRt] 콜백 오류", err);
    }
  }

  // ws(s)://주소/api/play/rt/{id} → http(s)://주소/api/play/rt-check/{id}
  function checkUrlFor(url) {
    const m = /^ws(s?):\/\/([^/?#]+)\/api\/play\/rt\/([^/?#]+)$/.exec(String(url));
    return m ? "http" + m[1] + "://" + m[2] + "/api/play/rt-check/" + m[3] : null;
  }

  function connect(matchId, opts) {
    opts = opts || {};
    const url =
      opts.url ||
      (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/play/rt/" + encodeURIComponent(matchId);
    const checkUrl = opts.checkUrl !== undefined ? opts.checkUrl : checkUrlFor(url);

    let ws = null;
    let wsOpened = false;     // 이번 소켓이 손잡기를 마쳤나 (못 마치고 끊기면 거절됐을 수 있다)
    let stopped = false;      // close() 했거나 final 로 닫힘
    let hello = false;        // 이번 연결에서 hello 를 받았나
    let tries = 0;            // 연달아 실패한 횟수
    let retryTimer = null;
    let pingTimer = null;
    let connectTimer = null;
    let probeTimer = null;
    let checking = 0;         // 거절 이유를 묻는 중이면 그 번호
    let openedAt = 0;
    let lastRecv = 0;
    let byeCode = null;
    let state = "closed";
    const bucket = { tokens: BURST, at: Date.now() };
    const info = { role: null, peerHere: false, rtt: null };

    function setState(next) {
      if (state === next) return;
      state = next;
      call(opts.onStatus, next);
    }

    function clearSockTimers() {
      if (pingTimer) clearInterval(pingTimer);
      if (connectTimer) clearTimeout(connectTimer);
      if (probeTimer) clearTimeout(probeTimer);
      pingTimer = connectTimer = probeTimer = null;
    }

    function clearTimers() {
      clearSockTimers();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    }

    function takeToken() {
      const now = Date.now();
      bucket.tokens = Math.min(BURST, bucket.tokens + ((now - bucket.at) / 1000) * RATE);
      bucket.at = now;
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    }

    // 서버에 하는 말(ping) — 개수 제한에 넣지 않는다 (드물고, 서버 쪽에 여유가 있다)
    function rawSend(obj) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try {
        ws.send(JSON.stringify(obj));
        return true;
      } catch (_) {
        return false;
      }
    }

    function scheduleRetry() {
      if (stopped || retryTimer) return;
      const base = BACKOFF[Math.min(tries, BACKOFF.length - 1)];
      const wait = Math.min(MAX_WAIT, Math.round(base * (0.8 + Math.random() * 0.4)));
      tries += 1;
      setState("retry");
      retryTimer = setTimeout(() => {
        retryTimer = null;
        open();
      }, wait);
    }

    function retryNow() {
      if (stopped || state !== "retry" || checking) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      open();
    }

    // 이 소켓은 버린다 — 닫는 인사를 기다리지 않는다 (죽은 연결은 인사도 늦게 온다)
    function drop(sock, reason) {
      lost(sock, 4000, reason);
      try { sock.close(4000, reason); } catch (_) { /* empty */ }
    }

    // 화면이 다시 보이거나 망이 돌아왔을 때 — 기다리는 중이면 바로 붙고, 열려 있어도 살아 있는지 짧게 확인한다
    function wake() {
      if (stopped) return;
      if (state === "retry") {
        retryNow();
        return;
      }
      const sock = ws;
      if (!sock) return;
      if (!hello) {
        // 붙는 중인데 너무 오래 걸렸다(숨어 있는 동안 타이머가 늦게 돌았을 수 있다)
        if (Date.now() - openedAt > CONNECT_MS) {
          drop(sock, "CONNECT_TIMEOUT");
          retryNow();
        }
        return;
      }
      const sentAt = Date.now();
      if (!rawSend({ sys: "ping", t: sentAt })) {
        drop(sock, "DEAD");
        retryNow();
        return;
      }
      if (probeTimer) clearTimeout(probeTimer);
      probeTimer = setTimeout(() => {
        probeTimer = null;
        if (ws === sock && lastRecv < sentAt) {
          drop(sock, "DEAD");
          retryNow();
        }
      }, PROBE_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") wake();
    }

    function open() {
      if (stopped) return;
      hello = false;
      wsOpened = false;
      byeCode = null;
      setState("connecting");
      let sock;
      try {
        sock = new WebSocket(url);
      } catch (err) {
        console.warn("[HKRt] 연결을 만들지 못했어요", err);
        scheduleRetry();
        return;
      }
      ws = sock;
      openedAt = lastRecv = Date.now();

      // 손잡기나 hello 가 끝내 안 오면(대답 없는 서버 · 망이 바뀌는 중) 버리고 다시 붙는다
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = setTimeout(() => {
        connectTimer = null;
        if (ws === sock && !hello) drop(sock, "CONNECT_TIMEOUT");
      }, CONNECT_MS);

      sock.onopen = () => {
        if (ws !== sock) return;
        wsOpened = true;
        lastRecv = Date.now();
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
          if (ws !== sock) return;
          if (Date.now() - lastRecv > DEAD_MS) {
            drop(sock, "DEAD");
            return;
          }
          rawSend({ sys: "ping", t: Date.now() });
        }, PING_MS);
      };

      sock.onmessage = (ev) => {
        if (ws !== sock) return;
        lastRecv = Date.now();
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (_) {
          return;
        }
        if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
        if (msg.sys === undefined) {
          if (hello && !byeCode) call(opts.onMessage, msg);
          return;
        }
        switch (msg.sys) {
          case "hello":
            hello = true;
            tries = 0;
            if (connectTimer) clearTimeout(connectTimer);
            connectTimer = null;
            info.role = msg.role === "guest" ? "guest" : "host";
            info.peerHere = !!msg.peerHere;
            setState("open");
            call(opts.onHello, { role: info.role, peerHere: info.peerHere });
            break;
          case "peer":
            info.peerHere = !!msg.here;
            call(opts.onPeer, info.peerHere);
            break;
          case "pong":
            if (typeof msg.t === "number") {
              const rtt = Math.max(0, Date.now() - msg.t);
              info.rtt = info.rtt == null ? rtt : Math.round(info.rtt * 0.7 + rtt * 0.3);
            }
            break;
          case "error":
            call(opts.onError, String(msg.code || ""));
            break;
          case "bye":
            byeCode = String(msg.code || ""); // 곧 닫힌다 — 이제 send 는 false
            break;
          default:
            break; // ping 등 — 살아 있다는 뜻만
        }
      };

      sock.onclose = (ev) => lost(sock, ev.code || 1006, ev.reason || "", !wsOpened);

      sock.onerror = () => {
        /* onclose 가 이어서 온다 */
      };
    }

    // 이 연결은 끝 — 다시 붙을지(final 이 아니면) 정한다. 같은 연결로 두 번 불려도 한 번만 처리한다
    function lost(sock, code, reason, refused) {
      if (ws !== sock) return;
      ws = null;
      hello = false;
      wsOpened = false;
      info.peerHere = false;
      clearSockTimers();
      let final = stopped || isFinal(code);
      // 서버가 이유를 먼저 알렸으면 그것을 따른다 — 닫는 인사 없이 끊겨도(1006) 다시 붙지 않는다
      const byeNum = byeCode ? REASON_CODES[byeCode] : undefined;
      if (byeNum && isFinal(byeNum) && !isFinal(code)) {
        code = byeNum;
        final = true;
      }
      reason = byeCode || reason;
      if (!final && refused && checkUrl) {
        askWhy(code, reason);
        return;
      }
      finish(code, reason, final);
    }

    function finish(code, reason, final) {
      if (final) stopped = true;
      call(opts.onClose, { code, reason, final, text: closeText(code, final) });
      if (final) {
        clearTimers();
        detach();
        setState("closed");
      } else {
        scheduleRetry();
      }
    }

    // 손잡기에서 끊겼다 — 서버가 받기 전에 거절했을 수 있으니 이유를 묻는다. 못 물으면 잠깐 문제로 보고 다시 붙는다
    function askWhy(code, reason) {
      const ticket = (checking = (checking % 1000000) + 1); // 묻는 동안은 "connecting" 그대로 — 다시 붙기(retryNow)도 기다린다
      let ctrl = null;
      let timer = null;
      try {
        ctrl = new AbortController();
        timer = setTimeout(() => ctrl.abort(), CHECK_MS);
      } catch (_) {
        ctrl = null;
      }
      fetch(checkUrl, { credentials: "include", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
        .then((body) => {
          if (timer) clearTimeout(timer);
          if (checking !== ticket) return;
          checking = 0;
          if (stopped || ws) return; // 그 사이 close() 했다
          const why = body && body.ok === false ? REASON_CODES[body.code] : undefined;
          if (why && isFinal(why)) finish(why, String(body.code), true);
          else finish(code, reason, false);
        });
    }

    function detach() {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", wake);
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", wake);
    open();

    return {
      send(obj) {
        if (!hello || byeCode || !ws || ws.readyState !== WebSocket.OPEN) return false;
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
        if (Object.prototype.hasOwnProperty.call(obj, "sys")) {
          console.warn('[HKRt] "sys" 키는 서버용이라 보낼 수 없어요.');
          return false;
        }
        let text;
        try {
          text = JSON.stringify(obj);
        } catch (_) {
          return false;
        }
        if (typeof text !== "string" || text.charAt(0) !== "{") return false; // toJSON 이 객체가 아닌 것을 돌려줌
        if (byteLength(text) > MAX_BYTES) {
          console.warn("[HKRt] 메시지가 4KB 를 넘어요.");
          return false;
        }
        if (ws.bufferedAmount > MAX_BUFFERED) return false; // 망이 막혀 쌓이는 중
        if (!takeToken()) return false; // 초당 개수를 넘음 — 서버가 몰래 버리기 전에 여기서 알린다
        try {
          ws.send(text);
          return true;
        } catch (_) {
          return false;
        }
      },
      close() {
        if (stopped && !ws) return;
        stopped = true;
        checking = 0;
        clearTimers();
        detach();
        const sock = ws;
        if (sock) {
          try { sock.close(1000, "BYE"); } catch (_) { /* empty */ }
          lost(sock, 1000, "BYE"); // onClose({ final: true }) — 나중에 오는 onclose 는 무시된다
        } else {
          setState("closed");
        }
      },
      get open() {
        return hello && !byeCode && !!ws && ws.readyState === WebSocket.OPEN;
      },
      get role() {
        return info.role;
      },
      get peerHere() {
        return info.peerHere;
      },
      get rtt() {
        return info.rtt;
      },
      get state() {
        return state;
      },
      get buffered() {
        return ws ? ws.bufferedAmount : 0;
      },
    };
  }

  return { connect, isFinal, closeText };
})();
