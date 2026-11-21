import { advanceTraffic, LANES, sweptContact } from './traffic.js?v=5';

export const ROAD_WIDTH = 14.4;
export { LANES };
export const SCORE_LIMIT = 1_000_000;
export const TIRE_RADIUS = .369;
export const PANEL_BREAK = .86;
// 내구도 5칸(운영자 요청, 3 → 5) — 차체 손상 그림은 3단계 그대로: 4·3칸 긁힘, 2·1칸 심한 손상, 0칸 파손
export const MAX_HEALTH = 5;
// 기름 · 휴게소(운영자 요청) — 기름 한 통으로 7 km, 휴게소는 3 km 지점부터 3.2 km 마다. 표지는 1.2 km 앞에서 보인다
export const FUEL_RANGE = 7000;
export const REST_FIRST = 3000;
export const REST_EVERY = 3200;
export const REST_SIGN = 1200;
export const restNames = ['노을 휴게소', '바람재 휴게소', '달빛 휴게소', '솔숲 휴게소', '물안개 휴게소'];
export const foods = [
  { id: 'walnut', name: '호두과자', price: 90, effect: '내구도 +1' },
  { id: 'udon', name: '우동', price: 180, effect: '내구도 가득 · 찌그러짐 펴기' },
  { id: 'hotbar', name: '핫바', price: 70, effect: '다음 휴게소까지 기름 25% 덜 씀' },
  { id: 'coffee', name: '커피', price: 110, effect: '3 km 동안 최고 속도 +12 km/h' },
];
export const restAt = index => REST_FIRST + index * REST_EVERY;
export function nextRest(state) {
  const index = Math.max(0, Math.ceil((state.distance - REST_FIRST) / REST_EVERY));
  const at = restAt(index);
  if (state.mode.goal && at > state.mode.goal - 400) return null;
  return { index, at, left: at - state.distance };
}
export function callRest(state) {
  const rest = nextRest(state);
  if (!rest || rest.left > REST_SIGN || state.outcome) return false;
  state.restCall = rest.at;
  return true;
}
export function eatFood(state, id) {
  if (id === 'walnut') state.health = Math.min(MAX_HEALTH, state.health + 1);
  if (id === 'udon') {
    state.health = MAX_HEALTH;
    for (const zone of Object.keys(state.damage)) state.damage[zone] *= .2;
  }
  if (id === 'hotbar') state.saver = restAt(state.restStop.index + 1);
  if (id === 'coffee') state.boostUntil = state.distance + 3000;
}
// 휴게소에서 나와 본선에 다시 합류 — 오른쪽 끝 차로, 근처 차는 비켜 둔다
export function leaveRest(state) {
  state.restStop = null;
  state.restCall = null;
  state.x = LANES[3];
  state.speed = Math.max(state.speed, state.car.top / 3.6 * .5);
  state.yaw = state.steer = state.acceleration = 0;
  state.cooldown = 2;
  state.traffic = state.traffic.filter(v => v.oncoming || v.x < 0 || v.z < state.distance - 40 || v.z > state.distance + 110);
}
export const damageStage = health => health <= 0 ? 3 : health <= 2 ? 2 : health < MAX_HEALTH ? 1 : 0;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const range = (low, high) => low + Math.random() * (high - low);
const damp = (from, to, dt, rate) => from + (to - from) * -Math.expm1(-rate * dt);

function course(name, length, curve, wave, grade, sections) {
  return { name, length, curve, wave, grade, sections: sections.map(([theme, name, landmark], i) => ({
    theme, name, landmark, start: Math.round(length * [0, .29, .63][i] / 20) * 20,
  })) };
}

export const courses = [
  course('서해 노을길', 8800, 24, 187, 2.7, [
    ['coast', '노을 해안', 'cliffs'], ['coast', '등대 대교', 'bridge'], ['port', '황혼 부두', 'cranes'],
  ]),
  course('항만 순환로', 10400, 28, 170, 1.4, [
    ['port', '컨테이너 터미널', 'cranes'], ['port', '항만 터널', 'tunnel'], ['metro', '강변 고가도로', 'towers'],
  ]),
  course('붉은 협곡', 11600, 34, 147, 5.4, [
    ['ridge', '적벽 협곡', 'columns'], ['desert', '황야 직선로', 'dunes'], ['ridge', '바위 아치', 'arch'],
  ]),
  course('안개 삼나무길', 9600, 29, 163, 4.8, [
    ['forest', '삼나무 숲', 'trees'], ['meadow', '바람 언덕', 'windmills'], ['forest', '안개 계곡', 'trees'],
  ]),
  course('네온 순환선', 11200, 25, 164, 2.1, [
    ['metro', '비 내리는 도심', 'towers'], ['metro', '도심 지하차도', 'tunnel'], ['port', '야경 대교', 'bridge'],
  ]),
  course('은빛 설산 고개', 12800, 36, 161, 6.3, [
    ['alpine', '설산 고개', 'snow'], ['forest', '침엽수 산길', 'trees'], ['alpine', '빙벽 전망로', 'snow'],
  ]),
  course('소금 사막 횡단로', 13600, 22, 214, 1.2, [
    ['desert', '소금 평원', 'dunes'], ['ridge', '노을 절벽', 'columns'], ['desert', '사막 풍력단지', 'windmills'],
  ]),
  course('초록 능선 종주', 14400, 37, 174, 6, [
    ['meadow', '초원 풍력단지', 'windmills'], ['forest', '숲 사이 고가도로', 'trees'], ['meadow', '목장 능선', 'fields'],
  ]),
];

function localDistance(course, distance, repeat) {
  const forward = Math.max(0, distance);
  return repeat ? forward % course.length : Math.min(forward, course.length - 1);
}

export function sectionIndex(course, distance, repeat = false) {
  const [, second, third] = course.sections;
  const local = localDistance(course, distance, repeat);
  return local >= third.start ? 2 : local >= second.start ? 1 : 0;
}

export function trackLook(course, distance, repeat) {
  const local = localDistance(course, distance, repeat);
  const index = sectionIndex(course, distance, repeat);
  const current = course.sections[index];
  const next = course.sections[index + 1] || (repeat ? course.sections[0] : current);
  const boundary = next.start || course.length;
  const t = clamp((local - boundary + 220) / 220, 0, 1);
  return { current, next, mix: t * t * (3 - 2 * t) };
}
export const cars = [
  { name: '솔라 S', color: '#c6d642', top: 224, power: 7.8, grip: 5.7, wheelbase: 3.36, shape: 'coupe' },
  { name: '이온 RS', color: '#34bce9', top: 248, power: 9.2, grip: 6.2, wheelbase: 3.08, shape: 'sport' },
  { name: '앰버 GT', color: '#ee763b', top: 270, power: 10.6, grip: 6.7, wheelbase: 3.50, shape: 'gt' },
  { name: '펄스 X', color: '#cab9ed', top: 296, power: 12.3, grip: 7.3, wheelbase: 3.26, shape: 'hyper' },
];
export const modes = [
  { id: 'sprint', name: '스프린트' },
  { id: 'endless', name: '끝없는 질주', detail: '차량이 버티는 한 계속 달리기' },
  { id: 'twoWay', name: '양방향', twoWay: true },
  { id: 'checkpoint', name: '체크포인트' },
  { id: 'rival', name: '라이벌', rival: true },
  { id: 'overtake', name: '추월 챌린지' },
];

export function routeMode(course, mode) {
  const goal = course.length;
  const km = (goal / 1000).toFixed(1) + ' km';
  switch (mode.id) {
    case 'sprint': {
      const time = Math.ceil(goal / 40) + 15;
      const clock = `${Math.floor(time / 60)}분 ${time % 60}초`;
      return { ...mode, goal, time, detail: `${clock} 안에 ${km} 완주` };
    }
    case 'twoWay': return { ...mode, goal, detail: `맞은편 차를 피해 ${km} 완주` };
    case 'checkpoint': {
      const gates = 6;
      const gate = goal / gates;
      const extra = Math.ceil(gate / 43) + 1;
      return { ...mode, goal, gate, gates, extra, time: extra + 12, detail: `${km} · 검문선 6곳 · 통과마다 +${extra}초` };
    }
    case 'rival': return { ...mode, goal, detail: `${km} 결승선에 라이벌보다 먼저 도착` };
    case 'overtake': {
      const passes = Math.round(goal / 240);
      const time = Math.ceil(goal / 55);
      return { ...mode, passes, time, detail: `${time}초 안에 교통 차량 ${passes}대 추월` };
    }
    default: return mode;
  }
}

export function roadX(course, z) {
  return course.curve * (Math.sin(z / course.wave) + .35 * Math.sin(z / 43));
}

export function roadSlope(course, z) {
  return course.curve * (Math.cos(z / course.wave) / course.wave + .35 * Math.cos(z / 43) / 43);
}

function roadCurvature(course, z, slope) {
  const change = -course.curve * (Math.sin(z / course.wave) / course.wave ** 2 + .35 * Math.sin(z / 43) / 43 ** 2);
  return change / (1 + slope ** 2) ** 1.5;
}

export function roadY(course, z) {
  return course.grade * (Math.sin(z / 122) + .32 * Math.sin(z / 46));
}

export function frontWheelAngle(angle, side, wheelbase, halfTrack) {
  const tangent = Math.tan(angle);
  return Math.atan2(wheelbase * tangent, wheelbase - side * halfTrack * tangent);
}

export function carStats(index, level) {
  const car = cars[index];
  return { ...car, top: car.top + level * 11, power: car.power + level * .85, grip: car.grip + level * .25 };
}

export function createRun(course, selectedMode, car) {
  const mode = routeMode(course, selectedMode);
  const rival = mode.rival ? { x: LANES[1], z: 26, speed: 40, color: '#fdb656', shape: 'gt', rival: true } : null;
  const state = {
    course, mode, car, rival, traffic: [], distance: 0, elapsed: 0, remaining: mode.time,
    x: LANES[2], speed: 23, acceleration: 0, steer: 0, wheelAngle: 0, wheelSpin: 0,
    yaw: 0, pitch: 0, roll: 0, health: MAX_HEALTH, fuel: 1, restCall: null, restStop: null, saver: 0, boostUntil: 0, cooldown: 0, score: 0, bonus: 0,
    overtakes: 0, closeCalls: 0, nextGate: mode.gate ?? Infinity, checkpoints: 0,
    spawnAt: 90, signal: null, impact: null, trafficImpact: null, damage: { front: 0, rear: 0, left: 0, right: 0 }, outcome: null,
  };
  fillTraffic(state);
  return state;
}

const paint = ['#c3cbd6', '#5d9cc3', '#b14545', '#c7a38b', '#7b789f', '#758875', '#c9c3af'];
function fillTraffic(state) {
  const { mode, distance } = state;
  while (state.spawnAt < distance + 380) {
    // 길이 완전히 막히지 않게 — 근처(±35m)에 이미 같은 방향 차가 선 차로는 막힌 것으로 치고, 내 방향 차로를 늘 하나 이상(일방향은 둘) 비워 둔다
    const ahead = [0, 1, 2, 3].filter(lane => !(mode.twoWay && lane < 2));
    const blocked = new Set(ahead.filter(lane => state.traffic.some(v => !v.oncoming &&
      Math.abs(v.x - LANES[lane]) < 1.9 && Math.abs(v.z - state.spawnAt) < 35)));
    const room = Math.max(0, ahead.length - (mode.twoWay ? 1 : 2) - blocked.size);
    const wanted = state.spawnAt < 110 ? 1 : Math.random() < .37 ? 2 : 1;
    const amount = Math.min(wanted, room + (mode.twoWay ? 1 : 0));
    const convoySpeed = range(18, 25);
    let forward = 0;
    for (let i = 0; i < amount; i++) {
      const lanes = [0, 1, 2, 3].filter(lane => !blocked.has(lane) && (!ahead.includes(lane) || forward < room));
      if (!lanes.length) break;
      const lane = lanes[Math.floor(range(0, lanes.length))];
      blocked.add(lane);
      const oncoming = mode.twoWay && lane < 2;
      if (!oncoming) forward++;
      const shape = Math.random() < .22 ? 'van' : Math.random() < .45 ? 'sedan' : 'wagon';
      state.traffic.push({
        x: LANES[lane], z: state.spawnAt + range(-4, 4), speed: (convoySpeed + range(-1.8, 1.8)) * (oncoming ? -1 : 1),
        shape, oncoming, color: paint[Math.floor(range(0, paint.length))], checked: false, bumped: false,
        clearance: Infinity,
      });
    }
    state.spawnAt += range(52, 68) * (mode.passes ? .85 : mode.twoWay ? 1.25 : 1);
  }
}

function touchVehicle(state, vehicle, hitX, hitZ, relativeX, relativeZ) {
  if (state.cooldown || vehicle.bumped) return;
  const lateral = relativeX / 1.8;
  const longitudinal = relativeZ / 4.25;
  const length = Math.hypot(lateral, longitudinal) || 1;
  const side = lateral / length;
  const front = longitudinal / length;
  const closing = Math.abs(state.speed - vehicle.speed);
  const force = clamp(.24 + closing * (.61 + .39 * Math.abs(front)) / 73 +
    Math.abs(Math.sin(state.yaw) * state.speed) / 52, .27, 1);
  const zone = Math.abs(front) >= Math.abs(side) ? front < 0 ? 'rear' : 'front' : side < 0 ? 'left' : 'right';
  const fatal = --state.health === 0;
  const stage = damageStage(state.health);
  const prior = state.damage[zone];
  const dent = stage === 1 ? .17 + force * .47 : .40 + force * .58;
  const damage = fatal ? 1 : Math.min(stage === 1 ? PANEL_BREAK - .01 : 1, prior + dent);
  state.damage[zone] = damage;
  const secondary = fatal ? (zone === 'front' || zone === 'rear' ? (side < 0 ? 'left' : 'right') : (front < 0 ? 'rear' : 'front')) : null;
  const priorSecondary = secondary ? state.damage[secondary] : 0;
  if (secondary) state.damage[secondary] = Math.max(priorSecondary, .72 + force * .12);
  const rearEnded = front < -.58 && vehicle.speed > state.speed;
  const speedChange = rearEnded ? closing * .40
    : -Math.min(state.speed * (fatal ? .90 : .72), closing * (.27 + Math.abs(front) * .43) + force * 3.6);
  state.impact = {
    x: hitX + side * 1.0, z: hitZ + front * 2.12, side, front, zone, closing, vehicle, force,
    carry: state.speed * .68, at: state.elapsed, duration: .22 + force * .19,
    speedChange, otherSpeedChange: (state.speed - vehicle.speed) * (.25 + .38 * Math.abs(front)),
    push: -(side || (state.x > vehicle.x ? -.25 : .25)) * (.5 + force * .83),
    contactGap: Math.abs(front) > .58 ? Math.max(2.7, Math.abs(vehicle.z - state.distance)) : 0,
    stage, fatal, prior, secondary, priorSecondary, detached: prior < PANEL_BREAK && damage >= PANEL_BREAK,
  };
  state.cooldown = 1.65;
  state.signal = fatal ? '차량 파손' : state.impact.detached ? '부품 이탈' : stage === 2 ? '차체 손상' : '충돌';
  vehicle.bumped = true;
}

function impactProgress(impact, elapsed) {
  const t = clamp((elapsed - impact.at) / impact.duration, 0, 1);
  return t * t * (3 - 2 * t);
}

function advanceImpact(state, dt) {
  const impact = state.impact;
  if (!impact || state.elapsed - dt >= impact.at + impact.duration) return;
  const change = impactProgress(impact, state.elapsed) - impactProgress(impact, state.elapsed - dt);
  const { vehicle, side, front, force, push, speedChange, otherSpeedChange } = impact;
  state.speed = clamp(state.speed + speedChange * change, 0, state.car.top / 3.6);
  state.x = clamp(state.x + push * change, -6.55, 6.55);
  state.yaw = clamp(state.yaw - side * force * .30 * change, -.58, .58);
  state.pitch = clamp(state.pitch - front * force * .085 * change, -.10, .055);
  vehicle.x = clamp(vehicle.x - push * change * .60, -6.7, 6.7);
  const otherSpeed = vehicle.speed + otherSpeedChange * change;
  vehicle.speed = vehicle.oncoming ? Math.min(0, otherSpeed) : Math.max(0, otherSpeed);
}

function collide(state, vehicle, lastX, lastZ, previousGap, length, width) {
  if (state.cooldown || vehicle.bumped) return;
  const fromX = vehicle.lastX - lastX, toX = vehicle.x - state.x;
  const toZ = vehicle.z - state.distance;
  const contact = sweptContact(fromX, toX, previousGap, toZ, width, length);
  if (!Number.isFinite(contact)) return;
  touchVehicle(state, vehicle, lastX + (state.x - lastX) * contact, lastZ + (state.distance - lastZ) * contact,
    fromX + (toX - fromX) * contact, previousGap + (toZ - previousGap) * contact);
}

function advanceCar(state, input, dt) {
  const { car, course, distance, speed, x } = state;
  const top = (car.top + (distance < state.boostUntil ? 12 : 0)) / 3.6;
  const braking = Boolean(input.brake);
  const onShoulder = Math.abs(x) > 6.28;
  const ratio = speed / top;
  const drag = .5 + 1.75 * ratio ** 2;
  const throttle = input.gas && !braking && state.fuel > 0 ? car.power * (1 - .61 * ratio) : 0;
  const brake = braking ? 10.2 + 5.2 * Math.min(1, speed / 18) : 0;
  const grade = (roadY(course, distance + 1) - roadY(course, distance - 1)) * 4.9;
  const shoulderDrag = onShoulder ? Math.min(8, speed) : 0;
  state.acceleration = damp(state.acceleration, throttle - drag - brake - grade - shoulderDrag,
    dt, braking ? 19 : 10);
  state.speed = clamp(speed + state.acceleration * dt, 0, top);

  const steer = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const speedFactor = state.speed ** 2 / (state.speed ** 2 + 22 ** 2);
  const lock = .49 - .37 * speedFactor;
  const slope = roadSlope(course, distance);
  const wheelbase = car.wheelbase;
  const steering = steer * lock;
  state.steer = damp(state.steer, steering, dt, steer ? 12 : 15);
  const curvature = roadCurvature(course, distance, slope);
  const roadTurn = Math.atan(wheelbase * curvature);
  state.wheelAngle = state.steer + roadTurn * Math.min(1, state.speed / 5);

  // The tyres limit the rate the steering can turn the car. The road tangent provides a neutral heading.
  const velocity = (speed + state.speed) * .5;
  const grip = car.grip * (onShoulder ? 1.35 : 2.23) * (braking ? .85 : 1);
  const turnLimit = grip / Math.max(velocity, 3);
  const turning = clamp(velocity * Math.tan(state.steer) / wheelbase, -turnLimit, turnLimit);
  const previousYaw = state.yaw;
  if (velocity > .02) {
    const stability = (.95 + 1.18 * speedFactor + (steer ? 0 : 1.96 + speedFactor * .85)) * Math.min(1, velocity / 2);
    state.yaw = clamp(damp(previousYaw, turning / stability, dt, stability), -.58, .58);
  }
  const direction = Math.atan(slope) + (previousYaw + state.yaw) * .5;
  const travel = velocity * dt;
  const forward = travel * Math.cos(direction);
  const lateral = travel * Math.sin(direction) - slope * forward;
  state.distance += forward;
  state.fuel = Math.max(0, state.fuel - Math.max(0, forward) / FUEL_RANGE * (state.distance < state.saver ? .75 : 1));
  state.x = clamp(x + lateral, -6.55, 6.55);
  if (state.x !== x + lateral) state.yaw = damp(state.yaw, 0, dt, 6);
  state.wheelSpin = (state.wheelSpin - travel / TIRE_RADIUS) % (Math.PI * 2);
  const lateralLoad = velocity * (turning + velocity * curvature);
  state.roll = damp(state.roll, clamp(lateralLoad * .0052, -.082, .082), dt, 6.5);
  const actualAcceleration = dt ? (state.speed - speed) / dt : 0;
  state.pitch = damp(state.pitch, clamp(actualAcceleration * .0048, -.075, .041), dt, 6);
}

export function step(state, input, dt) {
  if (state.outcome) return;
  const { mode, rival } = state;
  state.elapsed += dt;
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.signal = null;
  const before = state.distance;
  const previousX = state.x;
  advanceCar(state, input, dt);
  advanceImpact(state, dt);
  if (mode.time) state.remaining = Math.max(0, state.remaining - dt);
  advanceTraffic(state, dt, LANES[Math.floor(state.elapsed / 4) % LANES.length]);

  for (const vehicle of state.traffic) {
    const previousGap = vehicle.lastZ - before;
    const gap = vehicle.z - state.distance;
    const length = state.car.wheelbase / 2 + (vehicle.shape === 'van' ? 2.91 : 2.68);
    const width = vehicle.shape === 'van' ? 1.98 : 1.78;
    if (Math.min(previousGap, gap) <= length && Math.max(previousGap, gap) >= -length) {
      const fraction = clamp(previousGap / (previousGap - gap || 1), 0, 1);
      const crossingX = previousX + (state.x - previousX) * fraction;
      const trafficX = vehicle.lastX + (vehicle.x - vehicle.lastX) * fraction;
      const clearance = Math.abs(crossingX - trafficX);
      vehicle.clearance = Math.min(vehicle.clearance, clearance);
      collide(state, vehicle, previousX, before, previousGap, length, width);
    }
    if (gap < -length && previousGap >= -length && !vehicle.checked) {
      vehicle.checked = true;
      if (vehicle.bumped || vehicle.clearance < width) continue;
      if (!vehicle.oncoming) {
        state.overtakes++;
        state.bonus += 45;
      }
      if (vehicle.clearance < width + .82 && state.speed * 3.6 >= 115) {
        state.closeCalls++;
        state.bonus += 115;
        state.signal ||= '아슬아슬 추월  +115';
      }
    }
  }
  state.traffic = state.traffic.filter(vehicle => vehicle.z > state.distance - 85 && vehicle.z < state.distance + 620);
  fillTraffic(state);

  if (rival) {
    const previousGap = rival.lastZ - before;
    collide(state, rival, previousX, before, previousGap, state.car.wheelbase / 2 + 2.81, 1.79);
    if (Math.abs(rival.z - state.distance) > 16) rival.bumped = false;
  }
  if (state.distance >= state.nextGate) {
    state.checkpoints++;
    state.nextGate = state.checkpoints < mode.gates ? mode.gate * (state.checkpoints + 1) : Infinity;
    state.remaining += mode.extra;
    state.bonus += 150;
    state.signal ||= `체크포인트  +${mode.extra}초`;
  }

  if (mode.goal && state.health > 0 && state.health < MAX_HEALTH &&
      sectionIndex(state.course, state.distance) > sectionIndex(state.course, before)) {
    state.health++;
    for (const zone of Object.keys(state.damage)) state.damage[zone] *= .63;
    if (!state.signal) state.signal = '새 구간  ·  내구도 +1';
  }

  const rest = state.restCall;
  if (rest != null && before < rest && state.distance >= rest) {
    state.restStop = { index: Math.round((rest - REST_FIRST) / REST_EVERY), at: rest };
    state.restCall = null;
  } else if (rest != null && state.distance > rest) state.restCall = null;
  if (state.fuel < .2 && state.fuel + Math.max(0, state.distance - before) / FUEL_RANGE >= .2 && !state.signal) state.signal = '기름 부족  ·  휴게소에 들르세요';

  state.score = Math.min(SCORE_LIMIT, Math.floor(state.distance * .55 + state.bonus));
  if (state.health <= 0) state.outcome = 'wreck';
  else if (mode.goal && state.distance >= mode.goal) {
    state.outcome = !rival || state.distance >= rival.z ? 'win' : 'rival';
  } else if (mode.passes && state.overtakes >= mode.passes) state.outcome = 'win';
  else if (rival && rival.z >= mode.goal) state.outcome = 'rival';
  else if (mode.time && state.remaining <= 0) state.outcome = 'timeout';
  else if (state.fuel <= 0 && state.speed < 1.5) state.outcome = 'fuel';
  if (state.outcome === 'win') state.score = Math.min(SCORE_LIMIT, state.score + 550);
}

export function reward(state) {
  return Math.floor(state.score / 6);
}

export function advanceWreck(state, dt) {
  state.elapsed += dt;
  advanceCar(state, { brake: true }, dt);
  advanceImpact(state, dt);
  advanceTraffic(state, dt, state.rival?.x);
}
