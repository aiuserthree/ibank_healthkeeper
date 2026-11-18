// 주는 것: 장치 입력 — inputInit(키 · 마우스 듣기) · fillInput(입력 표 한 장 채우기) · clearKeys · BTN(단추 비트).
// 받는 것: CTX(단계 · 시점 · 잠금) · lock(사건 넣기) · tune/app · shared/input(quantAngle). 키는 e.code 로 받는다(한글 입력기에서도 같다). Alt 조합 없음.
// 시점은 mousemove 가 올 때 바로 더한다 — 잠겼을 때는 늘, 잠금이 없을 때는 마우스 단추를 누른 동안만(끌어서 둘러보기).
// 눌렀다 바로 뗀 것도 가장자리(edge)로 한 번은 실린다(래치). 발사 가장자리 보장 · 보간 · 감도 설정 · 휴대폰 조작은 뒤 단계(F3 …)가 더한다.
import { CTX } from './ctx.js';
import { lockEvent } from './lock.js';
import { quantAngle } from '../shared/input.js';
import { APP } from '../shared/tune/app.js';

export const BTN = Object.freeze({
  fire: 1, ads: 2, jump: 4, sprint: 8, crouch: 16, prone: 32, reload: 64, use: 128,
  weapon1: 256, weapon2: 512, frag: 1024, flash: 2048, melee: 4096, nvg: 8192, tab: 16384, skip: 32768,
});
const KEY_MOVE = Object.freeze({ KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8 });
const KEY_BTN = Object.freeze({
  Space: BTN.jump, ShiftLeft: BTN.sprint, ShiftRight: BTN.sprint, KeyC: BTN.crouch, KeyZ: BTN.prone, KeyR: BTN.reload, KeyF: BTN.use,
  Digit1: BTN.weapon1, Digit2: BTN.weapon2, KeyG: BTN.frag, KeyQ: BTN.flash, KeyV: BTN.melee, KeyN: BTN.nvg, Tab: BTN.tab, Enter: BTN.skip,
});
const MOUSE_BTN = Object.freeze([BTN.fire, 0, BTN.ads]);
const DEV = { move: 0, held: 0, edge: 0, wheel: 0, drag: 0 };
const TAU = Math.PI * 2;

export function clearKeys() { DEV.move = 0; DEV.held = 0; DEV.edge = 0; DEV.wheel = 0; DEV.drag = 0; }

// 이동 축: mx = 오른쪽(+) · 왼쪽(−), mz = 앞(+) · 뒤(−). 시점 각은 눈금에 맞춘 절대값. 가장자리와 휠은 읽으면 비운다
export function fillInput(input) {
  input.mx = ((DEV.move >> 3) & 1) - ((DEV.move >> 2) & 1);
  input.mz = (DEV.move & 1) - ((DEV.move >> 1) & 1);
  input.yaw = quantAngle(CTX.look.yaw); input.pitch = quantAngle(CTX.look.pitch);
  input.held = DEV.held; input.edge = DEV.edge; input.wheel = DEV.wheel;
  DEV.edge = 0; DEV.wheel = 0;
}

function press(bit) { DEV.held |= bit; DEV.edge |= bit; }

function onKeyDown(e) {
  if (e.code === 'Escape') { if (!e.repeat) lockEvent('esc'); return; }
  if (CTX.phase !== 'play' || e.altKey || e.ctrlKey || e.metaKey) return;
  const move = KEY_MOVE[e.code], bit = KEY_BTN[e.code];
  if (!move && !bit) return;
  e.preventDefault();
  if (e.repeat) return;
  if (move) DEV.move |= move; else press(bit);
}

function onKeyUp(e) {
  const move = KEY_MOVE[e.code], bit = KEY_BTN[e.code];
  if (move) DEV.move &= ~move; else if (bit) DEV.held &= ~bit;
}

function onMouseDown(e) {
  if (CTX.phase !== 'play') return;
  DEV.drag |= 1 << e.button;
  if (MOUSE_BTN[e.button]) press(MOUSE_BTN[e.button]);
  lockEvent('press');
}

function onMouseUp(e) {
  DEV.drag &= ~(1 << e.button);
  if (MOUSE_BTN[e.button]) DEV.held &= ~MOUSE_BTN[e.button];
}

function onMouseMove(e) {
  if (CTX.phase !== 'play' || !(CTX.lock.s === 'locked' || DEV.drag)) return;
  const look = CTX.look, max = APP.look.pitchMax;
  look.yaw -= (e.movementX || 0) * APP.look.sens;
  look.yaw -= Math.floor(look.yaw / TAU + 0.5) * TAU;
  look.pitch = Math.max(-max, Math.min(max, look.pitch - (e.movementY || 0) * APP.look.sens));
}

function onWheel(e) {
  if (CTX.phase !== 'play') return;
  e.preventDefault();
  DEV.wheel += Math.sign(e.deltaY);
}

export function inputInit(canvas) {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
}
