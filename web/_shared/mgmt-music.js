// 매니지먼트 게임 배경음악 — 소리 파일 없이 Web Audio 로 바로 연주하는 오리지널 곡
//   cafe 「옥상 쉼터 라운지」(느린 로파이 재즈) · farm 「옥상 텃밭의 오후」(어쿠스틱 기타 · 피리 · 새소리) · civ 「우리 동네 출근길」(마림바 · 통통 베이스, 경쾌하게)
//
// const music = HKMgmtMusic.create("cafe");  // "farm" · "civ"
//   music.toggle()        켜기 ↔ 끄기 (아케이드 공통 소리 설정과 같은 값 — 한쪽에서 끄면 다른 쪽도 꺼져 있다)
//   music.isOn()          지금 켜져 있는지
//   music.onChange(fn)    켜고 끌 때마다 fn(on)
// 머리 단추는 HKMgmtMusic.buttonHtml() 을 넣기만 하면 된다 — 그림 · 켜고 끄기는 이 파일이 맡는다(data-mgmt-music)
// 기본은 켜짐. 브라우저 정책상 화면을 처음 누르거나 키를 누른 뒤부터 소리가 난다.
// 다른 탭 · 앱으로 가면 멈추고, 돌아오면 이어서 연주한다. 소리는 작게(말소리 · 업무에 방해되지 않게).
window.HKMgmtMusic = (function () {
  const KEY = "hk-play-muted"; // 아케이드 공통 소리 켜기/끄기와 같은 값
  const readMuted = () => { try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; } };
  const writeMuted = (m) => { try { localStorage.setItem(KEY, m ? "1" : "0"); } catch (_) { /* 저장 못 해도 이번 화면에서는 따른다 */ } };

  // ── 곡 ────────────────────────────────────────────────────────
  // 음 이름 → MIDI 번호
  const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  const midi = (n) => { const m = /^([A-G][b#]?)(-?\d)$/.exec(n); return 12 * (Number(m[2]) + 1) + NOTE[m[1]]; };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // 옥상 쉼터 라운지 — 느린 로파이 재즈. 한 마디 = 16칸(16분음표), 8마디 한 바퀴(A 4마디 + B 4마디)
  const SONGS = {
    cafe: {
      style: "lounge",
      bpm: 74,
      swing: 0.62, // 8분음표 뒷박을 늦게 — 출렁이는 느낌
      // 마디마다 [베이스 근음, 건반 화음(아래→위), 멜로디에 쓰는 음]
      bars: [
        ["F2", ["A3", "C4", "E4", "G4"], ["C5", "E5", "F5", "G5", "A5"]], // Fmaj9
        ["A2", ["G3", "C4", "E4", "G4"], ["C5", "D5", "E5", "G5", "A5"]], // Am7
        ["Bb2", ["A3", "D4", "F4", "A4"], ["D5", "F5", "G5", "A5", "C6"]], // Bbmaj7
        ["C3", ["Bb3", "D4", "F4", "G4"], ["C5", "D5", "F5", "G5", "Bb5"]], // C9sus
        ["D2", ["F3", "A3", "C4", "E4"], ["D5", "E5", "F5", "A5", "C6"]], // Dm9
        ["G2", ["F3", "Bb3", "D4", "A4"], ["D5", "F5", "G5", "A5", "Bb5"]], // Gm9
        ["Bb2", ["A3", "D4", "F4", "C5"], ["D5", "F5", "A5", "C6"]], // Bbmaj9
        ["C3", ["Bb3", "E4", "G4", "A4"], ["C5", "E5", "G5", "A5", "Bb5"]], // C13
      ],
    },
    // 옥상 텃밭의 오후 — 곧은 박자의 포크. 기타 아르페지오 위로 피리가 가끔, 새소리 · 바람
    farm: {
      style: "meadow",
      bpm: 84,
      swing: 0.5,
      bars: [
        ["G2", ["G3", "B3", "D4", "G4"], ["B4", "D5", "E5", "G5"]], // G
        ["E2", ["E3", "B3", "D4", "G4"], ["B4", "D5", "E5", "G5"]], // Em7
        ["C3", ["C3", "G3", "D4", "E4"], ["C5", "D5", "E5", "G5"]], // Cadd9
        ["D3", ["D3", "A3", "D4", "G4"], ["A4", "D5", "E5", "G5"]], // Dsus4
        ["G2", ["G3", "B3", "D4", "G4"], ["B4", "D5", "G5", "A5"]], // G
        ["B2", ["B2", "F#3", "A3", "D4"], ["A4", "B4", "D5", "F#5"]], // Bm7
        ["C3", ["C3", "G3", "D4", "E4"], ["C5", "D5", "E5", "G5"]], // Cadd9
        ["D3", ["D3", "A3", "D4", "F#4"], ["A4", "D5", "E5", "F#5"]], // D
      ],
    },
    // 우리 동네 출근길 — 통통 튀는 마림바 · 피치카토 베이스 · 손뼉, 동네가 커 가는 기분
    civ: {
      style: "town",
      bpm: 100,
      swing: 0.56,
      bars: [
        ["C3", ["C4", "E4", "G4"], ["E5", "G5", "A5", "C6"]], // C
        ["A2", ["A3", "C4", "E4"], ["E5", "G5", "A5", "C6"]], // Am
        ["F2", ["F3", "A3", "C4"], ["F5", "A5", "C6", "D6"]], // F
        ["G2", ["G3", "B3", "D4"], ["D5", "G5", "A5", "B5"]], // G
        ["C3", ["C4", "E4", "G4"], ["E5", "G5", "C6", "D6"]], // C
        ["E2", ["E3", "G3", "B3"], ["E5", "G5", "B5", "D6"]], // Em
        ["F2", ["F3", "A3", "C4"], ["F5", "A5", "C6", "D6"]], // F
        ["G2", ["G3", "B3", "F4"], ["D5", "F5", "G5", "B5"]], // G7
      ],
    },
  };

  // 같은 곡이 매번 똑같지 않게 — 바퀴마다 다른 씨앗의 작은 난수
  function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

  function create(name) {
    const song = SONGS[name] || SONGS.cafe;
    let muted = readMuted();
    let ac = null, out = null, verb = null, noiseBuf = null, crackle = null;
    let timer = 0, step = 0, nextT = 0, loop = 0, rand = rng(7);
    let started = false; // 화면을 누른 뒤에만 시작
    const listeners = [];
    const stepDur = 60 / song.bpm / 4; // 16분음표 길이

    function ensure() {
      if (ac) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_) { /* 없음 */ }
      ac = new AC();
      // 전체: 부드럽게 깎는 저역 필터(로파이) → 압축 → 작은 음량
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200; lp.Q.value = 0.4;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      out = ac.createGain(); out.gain.value = 0;
      lp.connect(comp).connect(out).connect(ac.destination);
      // 잔향 — 짧은 방 울림(만든 임펄스)
      verb = ac.createConvolver();
      const len = Math.floor(ac.sampleRate * 1.6), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      verb.buffer = ir;
      const wet = ac.createGain(); wet.gain.value = 0.22;
      verb.connect(wet).connect(lp);
      out._in = lp;
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      return ac;
    }
    const dest = () => out._in;

    // ── 악기 ──
    // 전자 피아노 — 사인 + 두 배음 살짝 + 느린 떨림, 부드럽게 줄어든다
    function keys(t, m, len, vel) {
      const f = hz(m), g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.6);
      const trem = ac.createGain(); trem.gain.value = 1;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 4.6; lg.gain.value = 0.12; lfo.connect(lg).connect(trem.gain);
      [[1, 1, "sine"], [2, 0.18, "sine"], [3.01, 0.05, "triangle"]].forEach(([mul, amp, type]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.type = type; o.frequency.value = f * mul; o.detune.value = (Math.random() - 0.5) * 6; og.gain.value = amp;
        o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.7);
      });
      g.connect(trem); trem.connect(dest()); trem.connect(verb);
      lfo.start(t); lfo.stop(t + len + 0.7);
    }
    // 베이스 — 둥근 사인 + 아주 약한 세모파
    function bass(t, m, len) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.08, t + len * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      [["sine", 1], ["triangle", 0.25]].forEach(([type, amp]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.type = type; o.frequency.value = hz(m); og.gain.value = amp; o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.05);
      });
      g.connect(dest());
    }
    // 비브라폰 같은 멜로디 — 맑은 사인, 살짝 떨림, 잔향 많이
    function bell(t, m, vel) {
      const g = ac.createGain(), o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain();
      o.type = "sine"; o.frequency.value = hz(m); o2.type = "sine"; o2.frequency.value = hz(m) * 4; g2.gain.value = 0.06;
      const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5.2; vg.gain.value = 2.2; vib.connect(vg).connect(o.detune);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g); o2.connect(g2).connect(g); g.connect(dest()); g.connect(verb);
      [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + 1.5); });
    }
    // 어쿠스틱 기타 — 밝은 세모파가 빨리 줄고 고음을 깎는다(줄을 튕긴 느낌)
    function pluck(t, m, vel) {
      const g = ac.createGain(), f = ac.createBiquadFilter(), o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain();
      o.type = "triangle"; o.frequency.value = hz(m); o2.type = "sawtooth"; o2.frequency.value = hz(m); g2.gain.value = 0.18;
      f.type = "lowpass"; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.085 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(f); o2.connect(g2).connect(f); f.connect(g); g.connect(dest()); g.connect(verb);
      [o, o2].forEach((x) => { x.start(t); x.stop(t + 1.7); });
    }
    // 피리 — 천천히 차오르는 사인 + 숨소리, 떨림
    function flute(t, m, len) {
      const g = ac.createGain(), o = ac.createOscillator(), vib = ac.createOscillator(), vg = ac.createGain();
      o.type = "sine"; o.frequency.value = hz(m);
      vib.frequency.value = 5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(9, t + 0.4); vib.connect(vg).connect(o.detune);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.09);
      g.gain.setValueAtTime(0.045, t + len * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
      o.connect(g); g.connect(dest()); g.connect(verb);
      [o, vib].forEach((x) => { x.start(t); x.stop(t + len + 0.3); });
      noise(t, Math.min(0.25, len), 0.006, "bandpass", hz(m) * 2, 2); // 숨
    }
    // 마림바 — 사인 + 네 배음이 아주 빨리 사라진다
    function marimba(t, m, vel) {
      const g = ac.createGain();
      [[1, 1, 0.55], [4, 0.25, 0.08], [9.2, 0.06, 0.03]].forEach(([mul, amp, dec]) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.type = "sine"; o.frequency.value = hz(m) * mul;
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(amp, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(og).connect(g); o.start(t); o.stop(t + dec + 0.05);
      });
      g.gain.value = 0.11 * vel;
      g.connect(dest()); g.connect(verb);
    }
    // 피치카토 베이스 — 짧고 통통하게
    function pizz(t, m) {
      const g = ac.createGain(), o = ac.createOscillator(), f = ac.createBiquadFilter();
      o.type = "triangle"; o.frequency.value = hz(m); f.type = "lowpass"; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(f).connect(g).connect(dest()); o.start(t); o.stop(t + 0.35);
    }
    // 새 — 짧게 미끄러지는 높은 휘파람 두세 번
    function bird(t) {
      const n = 2 + Math.floor(rand() * 3), base = 2600 + rand() * 1400;
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + rand() * 0.05), o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(base * (1 + rand() * 0.2), tt); o.frequency.exponentialRampToValueAtTime(base * (1.3 + rand() * 0.4), tt + 0.06);
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.012, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
        o.connect(g).connect(dest()); o.start(tt); o.stop(tt + 0.1);
      }
    }
    function noise(t, len, gain, type, freq, q = 0.8) {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; s.playbackRate.value = 0.9 + Math.random() * 0.2;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      s.connect(f).connect(g).connect(dest());
      s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
    }
    function kick(t) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(dest()); o.start(t); o.stop(t + 0.3);
    }
    const brush = (t) => noise(t, 0.22, 0.05, "bandpass", 2400, 0.6); // 2 · 4박 브러시
    const shaker = (t, acc) => noise(t, 0.06, acc ? 0.022 : 0.012, "highpass", 7000);
    // 레코드판 지직 — 아주 작게, 가끔 톡
    // 텃밭은 지직 대신 아주 작은 바람 소리(천천히 일렁임), 동네는 아무것도 깔지 않는다
    function startCrackle() {
      if (crackle || song.style === "town") return;
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; s.loop = true;
      if (song.style === "meadow") {
        f.type = "lowpass"; f.frequency.value = 500; g.gain.value = 0.012;
        const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.008; lfo.connect(lg).connect(g.gain); lfo.start();
      } else { f.type = "highpass"; f.frequency.value = 3000; g.gain.value = 0.004; }
      s.connect(f).connect(g).connect(dest()); s.start();
      crackle = s;
    }

    // ── 연주 순서 — 앞으로 0.25초 분량씩 미리 걸어 둔다 ──
    let melody = []; // 이번 마디 멜로디 [칸, 음]
    function planBar(bar) {
      melody = [];
      const rest = { lounge: 0.35, meadow: 0.45, town: 0.25 }[song.style];
      if (rand() < rest) return; // 쉬는 마디도 있어야 숨이 쉬어진다
      const pool = bar[2].map(midi);
      const grid = song.style === "meadow" ? [0, 4, 8, 12] : song.style === "town" ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 3, 6, 8, 10, 12, 14];
      const spots = grid.filter(() => rand() < (song.style === "meadow" ? 0.55 : 0.42));
      let last = pool[Math.floor(rand() * pool.length)];
      for (const sp of spots) {
        // 가까운 음으로 이어 가기(크게 뛰지 않게)
        const near = pool.filter((n) => Math.abs(n - last) <= 5);
        last = (near.length ? near : pool)[Math.floor(rand() * (near.length || pool.length))];
        melody.push([sp, last]);
      }
    }
    function schedule() {
      const horizon = ac.currentTime + 0.25;
      while (nextT < horizon) {
        const barN = Math.floor(step / 16) % song.bars.length, s16 = step % 16, bar = song.bars[barN];
        if (s16 === 0) {
          if (barN === 0) { loop++; rand = rng(loop * 7919 + 13); }
          planBar(bar);
        }
        // 뒷박(홀수 8분)은 늦게 — 스윙
        const swingOff = s16 % 4 === 2 ? (song.swing - 0.5) * 2 * stepDur : 0;
        const t = nextT + swingOff;
        const chord = bar[1].map(midi), root = midi(bar[0]);
        if (song.style === "meadow") meadowStep(t, s16, barN, chord, root);
        else if (song.style === "town") townStep(t, s16, barN, chord, root);
        else loungeStep(t, s16, barN, chord, root);
        nextT += stepDur;
        step++;
      }
    }
    // 텃밭 — 기타 8분 아르페지오, 1 · 3박 베이스, 셰이커만 살짝, 피리 멜로디, 가끔 새
    function meadowStep(t, s16, barN, chord, root) {
      const ARP = [0, 2, 1, 3, 2, 1, 3, 2]; // 8분마다 화음의 몇 번째 음
      if (s16 % 2 === 0) pluck(t + (s16 === 0 ? 0 : (rand() - 0.5) * 0.01), chord[ARP[s16 / 2]] + (s16 >= 8 && rand() < 0.2 ? 12 : 0), s16 % 8 === 0 ? 1 : 0.7);
      if (s16 === 0) bass(t, root, stepDur * 7);
      if (s16 === 8) bass(t, root + 7 - (root + 7 > 52 ? 12 : 0), stepDur * 6);
      if (s16 % 4 === 2) shaker(t, false);
      for (const [sp, m] of melody) if (sp === s16) flute(t, m, stepDur * (rand() < 0.5 ? 4 : 3));
      if (s16 === 0 && rand() < 0.3) bird(t + stepDur * Math.floor(rand() * 12));
    }
    // 동네 — 마림바 통통(1 · 2박 뒷박 · 3박 · 4박 뒷박 화음), 피치카토 베이스, 손뼉 2 · 4박, 나무 딱딱이
    function townStep(t, s16, barN, chord, root) {
      if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 14) chord.forEach((m, i) => marimba(t + i * 0.008, m, s16 % 8 === 0 ? 0.9 : 0.6));
      if (s16 === 0) pizz(t, root);
      if (s16 === 4 && rand() < 0.6) pizz(t, root + 12);
      if (s16 === 8) pizz(t, root + 7);
      if (s16 === 12) pizz(t, root + (rand() < 0.5 ? 4 : 5));
      if (s16 === 0 || s16 === 8) kick(t);
      if (s16 === 4 || s16 === 12) noise(t, 0.12, 0.05, "bandpass", 1600, 1.2); // 손뼉
      if (s16 % 2 === 1 && rand() < 0.35) noise(t, 0.04, 0.025, "bandpass", 3200, 6); // 딱딱이
      if (s16 % 2 === 0) shaker(t, s16 % 4 === 0);
      for (const [sp, m] of melody) if (sp === s16) bell(t, m, 0.7 + rand() * 0.3);
    }
    // 카페 — 원래 연주
    function loungeStep(t, s16, barN, chord, root) {
      {
        // 건반 — 1박 화음 길게, 2박 뒷박에 짧게 한 번 더(가끔 3박 뒷박도)
        if (s16 === 0) chord.forEach((m, i) => keys(t + i * 0.012, m, stepDur * 9, 0.9));
        if (s16 === 6) chord.slice(1).forEach((m) => keys(t, m, stepDur * 3, 0.55));
        if (s16 === 10 && rand() < 0.5) chord.slice(1).forEach((m) => keys(t, m, stepDur * 4, 0.45));
        // 베이스 — 1박 근음, 3박 5도(가끔 옥타브), 마지막 박에 다음 근음으로 다가가는 음
        if (s16 === 0) bass(t, root, stepDur * 7);
        if (s16 === 8) bass(t, root + (rand() < 0.7 ? 7 : 12), stepDur * 5);
        if (s16 === 14 && rand() < 0.5) {
          const next = midi(song.bars[(barN + 1) % song.bars.length][0]);
          bass(t, next + (rand() < 0.5 ? -1 : 2), stepDur * 2);
        }
        // 드럼 — 아주 부드럽게
        if (s16 === 0 || (s16 === 10 && rand() < 0.6)) kick(t);
        if (s16 === 4 || s16 === 12) brush(t);
        if (s16 % 2 === 0) shaker(t, s16 % 4 === 0);
        // 멜로디
        for (const [sp, m] of melody) if (sp === s16) bell(t, m, 0.8 + rand() * 0.3);
      }
    }

    function fade(to, sec) {
      if (!ac) return;
      const now = ac.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(to, now + sec);
    }
    function play() {
      if (muted || document.hidden || !started) return;
      if (!ensure()) return;
      if (ac.state !== "running") ac.resume().catch(() => {});
      startCrackle();
      if (!timer) {
        nextT = Math.max(nextT, ac.currentTime + 0.08);
        timer = setInterval(schedule, 60);
        schedule();
      }
      fade(0.55, 1.6);
    }
    function stop(close) {
      clearInterval(timer); timer = 0;
      if (!ac) return;
      fade(0, 0.25);
      if (close) {
        const old = ac; ac = null; out = null; verb = null; noiseBuf = null; crackle = null;
        setTimeout(() => { try { old.close().catch(() => {}); } catch (_) { /* 이미 닫힘 */ } }, 300);
      }
    }

    // 처음 누를 때 시작 — 아이폰은 손을 뗄 때(pointerup · touchend)에만 소리를 연다
    const kickoff = () => { started = true; play(); };
    ["pointerdown", "pointerup", "touchend", "keydown"].forEach((t) => window.addEventListener(t, kickoff, { passive: true, capture: true }));
    // 화면을 떠나면 닫고(잠금화면에 「재생 중」으로 남지 않게), 돌아오면 다시 연다
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(true); else play(); });
    window.addEventListener("pagehide", () => stop(true));
    // 다른 탭에서 소리를 껐다 켰으면 따라간다
    window.addEventListener("storage", (e) => { if (e.key === KEY) set(readMuted(), false); });

    function set(m, save = true) {
      muted = m;
      if (save) writeMuted(m);
      if (m) { stop(false); setTimeout(() => { if (muted && ac && ac.state === "running") ac.suspend().catch(() => {}); }, 400); } else { started = true; play(); }
      listeners.forEach((fn) => { try { fn(!m); } catch (_) { /* 화면 쪽 */ } });
    }
    // 머리의 음표 단추(data-mgmt-music) — 화면이 다시 그려져도 새 단추를 찾아 칠하고, 누르면 켜고 끈다
    function paint(b) {
      const on = !muted, label = on ? "배경음악 끄기" : "배경음악 켜기";
      b.dataset.mm = "1";
      b.innerHTML = window.HKUI ? HKUI.icon(on ? "music" : "volume-x", 20, "currentColor") : on ? "♪" : "×";
      b.setAttribute("aria-label", label); b.title = label; b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("is-off", !on);
      if (window.HKUI && HKUI.refreshIcons) HKUI.refreshIcons(b);
    }
    const paintAll = (fresh) => document.querySelectorAll(fresh ? "[data-mgmt-music]:not([data-mm])" : "[data-mgmt-music]").forEach(paint);
    listeners.push(() => paintAll(false));
    const watch = () => { paintAll(true); new MutationObserver(() => paintAll(true)).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-mgmt-music]"); if (b) { e.preventDefault(); set(!muted); } });

    return {
      isOn: () => !muted,
      toggle: () => set(!muted),
      onChange: (fn) => listeners.push(fn),
    };
  }

  const buttonHtml = () => `<button type="button" class="mgx-icon mgx-music" data-mgmt-music aria-label="배경음악"></button>`;
  return { create, buttonHtml };
})();
