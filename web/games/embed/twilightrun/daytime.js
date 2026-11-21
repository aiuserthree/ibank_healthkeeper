// 시간 흐름 · 날씨(운영자 요청) — 코스를 달리는 동안 오전 7시 → 점심 → 오후 → 저녁(노을) → 밤 11시, 끝없는 질주는 하루가 돈다.
// 날씨는 코스 구간(약 1.2 km)마다 맑음 · 흐림 · 비 · 안개(설산은 눈)로 바뀐다 — 코스마다 늘 같은 순서(씨앗 고정).
// 운영자: 「시간의 흐름이 너무 빠른 거 아냐?」 — 한 판(코스 끝까지)에 약 6시간, 출발 시각은 판마다 오전 7 · 10시, 오후 2 · 5시 중 하나(밤 11시 전에 끝나게)
const DAY = 60000; // 끝없는 질주에서 하루 = 60 km
const RUN_SPAN = .375; // 한 판 = 16시간 중 6시간
export const DAY_STARTS = [0, .19, .44, .62];
const phases = [
  { at: 0, sky: 'morning', sun: '#ffd2a0', sunI: 1.85, amb: '#cddcff', ambI: 1.7, fog: '#c2c3c6', exposure: 1.18, night: 0, height: .35 },
  { at: .25, sky: 'noon', sun: '#fff4e2', sunI: 2.6, amb: '#d6e6ff', ambI: 2.0, fog: '#b6c6d6', exposure: 1.12, night: 0, height: 1 },
  { at: .5, sky: 'noon', sun: '#ffe4bc', sunI: 2.35, amb: '#d4def0', ambI: 1.9, fog: '#bcbfc2', exposure: 1.12, night: 0, height: .8 },
  { at: .7, sky: 'sunset', sun: '#ff9858', sunI: 2.15, amb: '#f0c0b6', ambI: 1.7, fog: '#a57e78', exposure: 1.15, night: .15, height: .25 },
  { at: .86, sky: 'night', sun: '#7f98d4', sunI: .32, amb: '#3c4a78', ambI: .62, fog: '#141a28', exposure: .82, night: 1, height: .6 },
  { at: 1, sky: 'night', sun: '#7f98d4', sunI: .32, amb: '#3c4a78', ambI: .62, fog: '#141a28', exposure: .82, night: 1, height: .6 },
];
const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
const mixHex = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

export function dayProgress(state) {
  const start = state.dayStart || 0;
  const span = state.mode.goal ? Math.min(1, state.distance / state.mode.goal) * RUN_SPAN : state.distance / DAY;
  return (start + span) % 1;
}

// 하루 중 지금 — 빛 · 안개 색(사이를 부드럽게), 하늘 그림 두 장과 섞는 비율, 시계
export function dayTime(progress, endless = false) {
  // 끝없는 질주: 밤 다음에 다시 아침으로 넘어가도록 마지막 구간을 아침으로 잇는다
  const list = endless ? [...phases.slice(0, -1), { ...phases.at(-1), at: .96 }, { ...phases[0], at: 1 }] : phases;
  let i = list.findIndex(p => p.at > progress) - 1;
  if (i < 0) i = list.length - 2;
  const a = list[i], b = list[i + 1];
  const t = Math.min(1, Math.max(0, (progress - a.at) / (b.at - a.at)));
  const s = t * t * (3 - 2 * t);
  const lerp = key => a[key] + (b[key] - a[key]) * s;
  const minutes = Math.round(7 * 60 + progress * 16 * 60);
  const hour = Math.floor(minutes / 60) % 24, minute = minutes % 60;
  const label = hour < 11 ? '오전' : hour < 14 ? '점심' : hour < 17 ? '오후' : hour < 20 ? '저녁' : '밤';
  return {
    skyA: a.sky, skyB: b.sky, skyMix: a.sky === b.sky ? 0 : s,
    sun: mixHex(a.sun, b.sun, s), amb: mixHex(a.amb, b.amb, s), fog: mixHex(a.fog, b.fog, s),
    sunI: lerp('sunI'), ambI: lerp('ambI'), exposure: lerp('exposure'), night: lerp('night'), height: lerp('height'),
    clock: `${label} ${hour > 12 ? hour - 12 : hour}:${String(minute).padStart(2, '0')}`,
  };
}

// 시간대별 교통량(운영자 요청) — 지금 교통량(1)이 가장 많은 쪽(출근 · 퇴근길), 다른 때는 줄기만(운영자: 지금보다 더 많게는 하지 마)
const trafficBands = [
  { from: 7, to: 9, density: 1, label: '출근길이라 차가 많아요' },
  { from: 9, to: 12, density: .85, label: '오전이라 길이 조금 한가해요' },
  { from: 12, to: 14, density: .9, label: '점심때라 차가 꽤 있어요' },
  { from: 14, to: 17, density: .8, label: '오후라 길이 한가해요' },
  { from: 17, to: 19, density: 1, label: '퇴근길이라 차가 많아요' },
  { from: 19, to: 21, density: .7, label: '저녁이라 차가 줄었어요' },
  { from: 21, to: 31, density: .5, label: '밤이라 길이 한산해요' },
];
export function trafficBand(progress) {
  const hour = 7 + progress * 16;
  return trafficBands.find(band => hour >= band.from && hour < band.to) || trafficBands.at(-1);
}

const seeded = n => { const x = Math.sin(n * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
const SPAN = 1200;
function weatherKind(course, index) {
  const r = seeded(index * 7.3 + course.length * .013);
  const theme = course.sections.find(part => part.start <= ((index + .5) * SPAN) % course.length) || course.sections[0];
  if (index === 0 || r < .45) return 'clear';
  if (r < .63) return 'cloudy';
  if (r < .8) return theme.theme === 'alpine' ? 'snow' : theme.theme === 'desert' ? 'cloudy' : 'rain';
  return theme.theme === 'desert' ? 'clear' : 'fog';
}
export const weatherNames = { clear: '맑음', cloudy: '흐림', rain: '비', fog: '안개', snow: '눈' };
// 지금 날씨 — kind, 바뀌는 곳 앞뒤 150 m 는 부드럽게(amount 0~1)
export function weatherAt(course, distance) {
  const index = Math.floor(Math.max(0, distance) / SPAN);
  const kind = weatherKind(course, index);
  const into = Math.max(0, distance) - index * SPAN;
  const prev = index ? weatherKind(course, index - 1) : kind;
  const amount = kind === 'clear' ? 0 : prev === kind ? 1 : Math.min(1, into / 150);
  return { kind, amount, index };
}
