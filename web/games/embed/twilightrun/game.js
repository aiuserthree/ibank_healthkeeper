import { advanceWreck, callRest, cars, carStats, clamp, courses, createRun, damageStage, eatFood, foods, leaveRest, MAX_HEALTH, modes, nextRest, REST_SIGN, restNames, reward, routeMode, SCORE_LIMIT, sectionIndex, step } from './drive.js?v=4';
import { createScene } from './scene.js?v=4';
import { impactDuration } from './impact.js?v=4';
import { assetRoot } from './world.js?v=4';
import { requestYield } from './traffic.js?v=4';
import { createShowroom } from './showroom.js?v=4';

const $ = id => document.getElementById(id);
const stage = $('road');
const impactLens = stage.querySelector('.impact-lens');
const scene = createScene(stage);
const embedded = parent !== window;
const send = (type, detail = {}) => {
  if (embedded) parent.postMessage({ type, ...detail }, location.origin);
};
const number = value => value.toLocaleString('ko-KR');
const storageKey = 'healthkeeper.twilightrun.v1';
const arcadeMuteKey = 'hk-play-muted';
const maxUpgrade = 3;
const controls = new Map([
  ['ArrowUp', 'gas'], ['KeyW', 'gas'], ['ArrowDown', 'brake'], ['KeyS', 'brake'],
  ['ArrowLeft', 'left'], ['KeyA', 'left'], ['ArrowRight', 'right'], ['KeyD', 'right'],
]);
const keys = new Set();
const touch = new Map();
const touchButtons = [...document.querySelectorAll('[data-drive]')];
const healthLights = [...$('health').children];
const condition = $('vehicle-condition');
const conditionNames = ['내구도', '외판 긁힘', '심한 손상', '차량 파손'];
const viewNames = ['기본', '멀리', '보닛'];
const titles = { win: '완주 성공!', wreck: '차량 파손', timeout: '시간 초과', rival: '라이벌 승리', retired: '주행 종료', fuel: '기름 바닥' };

function load() {
  let data;
  try { data = JSON.parse(localStorage.getItem(storageKey)); } catch { data = null; }
  const upgrades = cars.map((_, i) => Number.isInteger(data?.upgrades?.[i])
    ? clamp(data.upgrades[i], 0, maxUpgrade) : 0);
  return {
    balance: Number.isSafeInteger(data?.balance) ? Math.max(0, data.balance) : 0,
    best: Number.isSafeInteger(data?.best) ? clamp(data.best, 0, SCORE_LIMIT) : 0,
    car: Number.isInteger(data?.car) && cars[data.car] ? data.car : 0,
    course: Number.isInteger(data?.course) && courses[data.course] ? data.course : 0,
    mode: Number.isInteger(data?.mode) && modes[data.mode] ? data.mode : 0,
    sound: data?.sound === true,
    upgrades,
  };
}
const profile = load();
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(profile)); } catch { /* Storage may be disabled. */ }
}

let state, audio, engine, volume, impactBus, hornReady, activeHorn;
const soundClips = {};
let screen = 'home';
let hosted = false;
let arcadeMuted = false;
let view = 0;
let countdown = 0;
let liveAt = 0;
let messageFor = 0;
let previous = 0;
let raf = 0;
let hudAt = 0;
let runStarted = false;
let impactAge = Infinity;
let lastTrafficSound = -Infinity;

const soundEnabled = () => hosted ? !arcadeMuted : profile.sound;

function loadSoundClips(context) {
  for (const name of ['collision', 'debris', 'horn']) {
    const loading = fetch(`${assetRoot}audio/${name}.mp3`).then(response => {
      if (!response.ok) throw new Error(`Recording ${name} unavailable`);
      return response.arrayBuffer();
    }).then(data => context.decodeAudioData(data))
      .then(buffer => { soundClips[name] = buffer; return buffer; })
      .catch(error => console.info('Twilight Run:', error.message));
    if (name === 'horn') hornReady = loading;
  }
}

function wakeAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!soundEnabled() || !Audio) return;
  if (!audio) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* Optional Safari API. */ }
    audio = new Audio();
    engine = audio.createOscillator();
    engine.type = 'triangle';
    engine.frequency.value = 40;
    volume = audio.createGain();
    volume.gain.value = 0;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    engine.connect(filter).connect(volume).connect(audio.destination);
    engine.start();
    impactBus = audio.createGain();
    const limiter = audio.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 8;
    limiter.ratio.value = 5;
    impactBus.connect(limiter).connect(audio.destination);
    loadSoundClips(audio);
  }
  impactBus.gain.setTargetAtTime(1, audio.currentTime, .03);
  audio.resume().catch(() => {});
}

function beep(frequency, length = .16, gain = .075, type = 'triangle') {
  if (!soundEnabled() || !audio || audio.state !== 'running') return;
  const at = audio.currentTime;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(.001, at);
  envelope.gain.linearRampToValueAtTime(gain, at + .025);
  envelope.gain.exponentialRampToValueAtTime(.001, at + length);
  oscillator.connect(envelope).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length + .015);
}

function quietEngine() {
  if (!audio) return;
  volume.gain.setTargetAtTime(0, audio.currentTime, .07);
  if (!soundEnabled()) impactBus.gain.setTargetAtTime(0, audio.currentTime, .03);
}

function playImpact({ force, stage = 1, detached = false, side }, distance = 0) {
  if (!soundEnabled() || !audio || audio.state !== 'running') return;
  const at = audio.currentTime;
  const vicinity = distance ? .47 / (1 + distance / 16) ** 1.2 : 1;
  function play(name, start, gain, rate, cutoff, tail) {
    const buffer = soundClips[name];
    if (!buffer) return;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const tone = audio.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = cutoff;
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(gain * vicinity, start);
    if (tail) envelope.gain.exponentialRampToValueAtTime(.0001, start + tail);
    source.connect(tone).connect(envelope);
    if (audio.createStereoPanner) {
      const pan = audio.createStereoPanner();
      pan.pan.value = clamp(side * .54, -.62, .62);
      envelope.connect(pan).connect(impactBus);
    } else envelope.connect(impactBus);
    source.start(start);
  }
  play('collision', at, .45 + force * .63 + (stage - 1) * .17,
    1.16 - force * .24 - (stage - 1) * .045, distance ? 3100 : 3750 + force * 4600,
    stage === 1 && force < .47 ? .48 : null);
  if (stage >= 2 || detached || force > .76) {
    play('debris', at + .075, .21 + .15 * force + (stage - 1) * .13,
      1.05 - stage * .042, distance ? 2600 : 8300, null);
  }
}

function homeInfo() {
  $('balance').textContent = number(profile.balance);
  $('best').textContent = number(profile.best);
  const course = courses[profile.course];
  const length = (course.length / 1000).toFixed(1);
  $('course-detail').textContent = `${length} km · ${course.sections.map(part => part.name).join(' → ')}`;
  $('course-preview').style.backgroundImage = `url("${assetRoot}horizons/${course.sections[0].theme}.webp")`;
  $('mode-detail').textContent = routeMode(course, modes[profile.mode]).detail;
  scene.prepare(course);
  $('sound').textContent = profile.sound ? '소리 끄기' : '소리 켜기';
  $('sound').setAttribute('aria-pressed', String(profile.sound));
}

function setOptions(id, items) {
  const select = $(id);
  items.forEach((item, i) => select.add(new Option(item.name, i)));
  select.value = profile[id];
  select.addEventListener('change', () => {
    profile[id] = Number(select.value);
    save();
    homeInfo();
  });
}
setOptions('course', courses);
setOptions('mode', modes);

const carOptions = $('car-options');
const carPicture = car => `${assetRoot}garage/${car.shape}.webp?v=4`;
// 차 단추에 마우스를 올리면(키보드는 포커스, 터치는 누를 때 잠깐) 주행 때와 같은 3D 모델을 패널 옆에 크게 띄운다
const carStage = $('car-stage');
const showroom = createShowroom(carStage.querySelector('canvas'), cars,
  () => screen === 'home' && !$('home').hidden && carStage.classList.contains('open'));
const portraits = showroom ? showroom.portraits(600, 260) : [];
const carPortrait = (car, i) => portraits[i] || carPicture(car);
if (!showroom) {
  carStage.classList.add('still');
  $('car-still').hidden = false;
}
let peekTimer = 0;
let peekBy = '';
function peek(i, by = 'mouse') {
  clearTimeout(peekTimer);
  peekBy = by;
  const car = carStats(i, profile.upgrades[i]);
  $('peek-name').textContent = cars[i].name;
  $('peek-spec').textContent = `최고 ${car.top} km/h · 가속 ${car.power.toFixed(1)}`;
  if (showroom) showroom.show(i);
  else $('car-still').src = carPicture(cars[i]);
  carStage.classList.add('open');
}
function unpeek(delay = 220) {
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => carStage.classList.remove('open'), delay);
}
carOptions.innerHTML = cars.map((car, i) => `
  <div>
    <input id="car-${i}" type="radio" name="car" value="${i}">
    <label class="car-option" for="car-${i}">
      <img src="${carPortrait(car, i)}" width="600" height="260" alt="">
      <span>${car.name}</span>
    </label>
  </div>`).join('');
const carInputs = [...carOptions.querySelectorAll('input')];
function paintCarSelection() {
  carInputs[profile.car].checked = true;
  const car = carStats(profile.car, profile.upgrades[profile.car]);
  $('car-spec').textContent = `최고 ${car.top} km/h · 가속 ${car.power.toFixed(1)}`;
}
const optionIndex = event => {
  const label = event.target.closest?.('.car-option');
  return label ? Number(label.htmlFor.slice(4)) : -1;
};
carOptions.addEventListener('pointerover', event => {
  const i = optionIndex(event);
  if (event.pointerType === 'mouse' && i >= 0) peek(i);
});
carOptions.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') unpeek(); });
carOptions.addEventListener('pointerup', event => {
  const i = optionIndex(event);
  if (event.pointerType !== 'mouse' && i >= 0) { peek(i, 'touch'); unpeek(2600); }
});
carOptions.addEventListener('focusin', event => {
  if (event.target.matches('input:focus-visible')) peek(Number(event.target.value), 'focus');
});
carOptions.addEventListener('focusout', () => { if (peekBy === 'focus') unpeek(); });
carStage.addEventListener('pointerenter', () => clearTimeout(peekTimer));
carStage.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') unpeek(); });
carOptions.addEventListener('change', event => {
  profile.car = Number(event.target.value);
  save();
  paintCarSelection();
  if (event.target.matches(':focus-visible')) peek(profile.car, 'focus');
});

const upgradeCost = (i, level) => 220 + i * 85 + level * 155;
function garageInfo(focus) {
  $('garage-balance').textContent = number(profile.balance);
  $('car-list').innerHTML = cars.map((car, i) => {
    const equipped = profile.car === i;
    const level = profile.upgrades[i];
    const stats = carStats(i, level);
    const price = upgradeCost(i, level);
    const selectButton = equipped ? '선택됨' : '선택';
    return `<article class="car-card ${equipped ? 'current' : ''}">
      <img class="car-portrait" src="${carPortrait(car, i)}" width="600" height="260" alt="">
      <h3>${car.name}</h3>
      <p class="car-stats"><span>${stats.top} km/h</span><span>가속 ${stats.power.toFixed(1)}</span><span>강화 ${level}/${maxUpgrade}</span></p>
      <div class="car-actions">
        <button type="button" class="button quiet" data-car="${i}" data-action="equip" ${equipped ? 'disabled' : ''}>${selectButton}</button>
        <button type="button" class="button quiet" data-car="${i}" data-action="upgrade" ${level >= maxUpgrade || profile.balance < price ? 'disabled' : ''}>${level >= maxUpgrade ? '강화 완료' : '강화 · ' + number(price)}</button>
      </div>
    </article>`;
  }).join('');
  if (focus) {
    const same = $('car-list').querySelector(`button[data-car="${focus.i}"][data-action="${focus.action}"]:not(:disabled)`);
    const alternative = $('car-list').querySelector(`button[data-car="${focus.i}"]:not(:disabled)`);
    (same || alternative || $('close-garage')).focus();
  }
}

$('garage-button').addEventListener('click', () => {
  $('garage-status').textContent = '';
  garageInfo();
  $('garage').showModal();
});
$('close-garage').addEventListener('click', () => $('garage').close());
$('car-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const i = Number(button.dataset.car);
  const { action } = button.dataset;
  const car = cars[i];
  if (action === 'equip') {
    profile.car = i;
    $('garage-status').textContent = `${car.name} 선택 완료`;
  } else if (action === 'upgrade' && profile.upgrades[i] < maxUpgrade) {
    const price = upgradeCost(i, profile.upgrades[i]);
    if (profile.balance < price) return;
    profile.balance -= price;
    profile.upgrades[i]++;
    $('garage-status').textContent = `${car.name} ${profile.upgrades[i]}단계 강화 완료`;
  } else return;
  save();
  garageInfo({ i, action });
  paintCarSelection();
  $('balance').textContent = number(profile.balance);
});

$('sound').addEventListener('click', () => {
  profile.sound = !profile.sound;
  if (profile.sound) {
    wakeAudio();
    beep(520);
  } else quietEngine();
  save();
  homeInfo();
});

function paintHud() {
  const { course, mode, overtakes, distance, score, health, speed, remaining, rival, checkpoints } = state;
  $('distance').textContent = (distance / 1000).toFixed(2);
  $('score').textContent = number(score);
  $('speed').textContent = Math.round(speed * 3.6);
  $('speed-bar').style.transform = `scaleX(${clamp(speed * 3.6 / state.car.top, 0, 1)})`;
  const progress = mode.passes ? overtakes / mode.passes : mode.goal ? distance / mode.goal : 0;
  $('progress-track').hidden = !mode.goal && !mode.passes;
  $('progress-track').setAttribute('aria-valuenow', String(Math.round(clamp(progress, 0, 1) * 100)));
  $('progress').style.transform = `scaleX(${clamp(progress, 0, 1)})`;
  const objective = mode.passes ? `추월 ${overtakes}/${mode.passes}`
    : mode.gate ? `검문선 ${checkpoints}/${mode.gates}`
    : mode.goal ? `목표 ${(mode.goal / 1000).toFixed(1)} km` : `추월 ${overtakes}대`;
  const gap = rival && Math.round(distance - rival.z);
  const race = rival ? ` · ${gap >= 0 ? '선두' : '2위'} ${Math.abs(gap)} m` : '';
  const seconds = Math.ceil(remaining);
  const clock = seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}초`;
  $('remaining').textContent = (mode.time ? clock + ' · ' : '') + objective + race;
  const segment = sectionIndex(course, distance, !mode.goal);
  const locationLabel = `${segment + 1}/${course.sections.length} · ${course.sections[segment].name}`;
  if ($('race-location').textContent !== locationLabel) $('race-location').textContent = locationLabel;
  $('fuel-bar').style.transform = `scaleX(${state.fuel})`;
  $('fuel').setAttribute('aria-valuenow', String(Math.round(state.fuel * 100)));
  $('fuel').classList.toggle('low', state.fuel < .2);
  paintRestSign();
  $('health').setAttribute('aria-label', `내구도 ${health} / ${MAX_HEALTH}`);
  healthLights.forEach((light, i) => light.classList.toggle('lost', i >= health));
  const conditionLabel = conditionNames[damageStage(health)];
  if (condition.textContent !== conditionLabel) {
    condition.textContent = conditionLabel;
    condition.parentElement.dataset.condition = String(damageStage(health));
  }
}

function paintRestSign() {
  const rest = state.outcome ? null : nextRest(state);
  const near = rest && rest.left <= REST_SIGN && rest.left > 0;
  $('rest-sign').hidden = !near;
  if (!near) return;
  const called = state.restCall === rest.at;
  $('rest-sign').classList.toggle('called', called);
  $('rest-sign-name').textContent = restNames[rest.index % restNames.length];
  $('rest-sign-left').textContent = called ? '오른쪽으로 빠집니다' : `${rest.left >= 1000 ? (rest.left / 1000).toFixed(1) + ' km' : Math.round(rest.left / 10) * 10 + ' m'}`;
}
function askRest() {
  if (screen !== 'drive' || $('paused').open || $('rest').open || countdown > 0) return;
  if (callRest(state)) {
    beep(660, .09);
    paintRestSign();
  }
}

// 휴게소: 주행을 멈추고 차에서 내린 화면 — 주유(무료) · 식당(크레딧으로 음식, 휴게소마다 한 가지씩 한 번)
let restEaten = new Set();
function restTab(name) {
  const food = name === 'food';
  $('tab-station').setAttribute('aria-selected', String(!food));
  $('tab-food').setAttribute('aria-selected', String(food));
  $('rest-station').hidden = food;
  $('rest-food').hidden = !food;
  $('rest-scene').dataset.scene = food ? 'food' : 'station';
}
function paintRest() {
  $('tank-bar').style.transform = `scaleX(${state.fuel})`;
  $('tank-value').textContent = `${Math.round(state.fuel * 100)}%`;
  $('refuel').disabled = state.fuel >= .995;
  $('rest-balance').textContent = number(profile.balance);
  $('menu-list').innerHTML = foods.map(food => {
    const eaten = restEaten.has(food.id);
    const full = (food.id === 'walnut' || food.id === 'udon') && state.health >= MAX_HEALTH && !Object.values(state.damage).some(Boolean);
    const disabled = eaten || full || profile.balance < food.price;
    return `<button type="button" class="dish ${eaten ? 'eaten' : ''}" data-food="${food.id}" ${disabled ? 'disabled' : ''}>
      <img src="${assetRoot}rest/${food.id}.webp?v=1" width="256" height="256" alt="">
      <b>${food.name}</b><small>${food.effect}</small>
      <em>${eaten ? '먹었어요' : full ? '내구도 가득' : '◆ ' + number(food.price)}</em>
    </button>`;
  }).join('');
}
function enterRest() {
  clearInput();
  quietEngine();
  restEaten = new Set();
  $('rest-title').textContent = restNames[state.restStop.index % restNames.length];
  $('rest-status').textContent = '';
  restTab('station');
  paintRest();
  $('rest').showModal();
  $('refuel').disabled ? $('tab-food').focus() : $('refuel').focus();
  send('hk:paused');
}
function departRest() {
  if (!$('rest').open) return;
  $('rest').close();
  leaveRest(state);
  previous = 0;
  wakeAudio();
  stage.focus();
  paintHud();
  send('hk:resumed');
  schedule();
}
$('tab-station').addEventListener('click', () => restTab('station'));
$('tab-food').addEventListener('click', () => restTab('food'));
$('refuel').addEventListener('click', () => {
  state.fuel = 1;
  $('rest-status').textContent = '기름을 가득 넣었습니다';
  beep(560, .12);
  paintRest();
});
$('menu-list').addEventListener('click', event => {
  const button = event.target.closest('[data-food]');
  if (!button || button.disabled) return;
  const food = foods.find(item => item.id === button.dataset.food);
  if (profile.balance < food.price) return;
  profile.balance -= food.price;
  save();
  eatFood(state, food.id);
  restEaten.add(food.id);
  $('rest-status').textContent = `${food.name} 냠 — ${food.effect}`;
  beep(700, .1);
  paintRest();
  $('menu-list').querySelector(`[data-food="${food.id}"]`)?.focus();
});
$('depart').addEventListener('click', departRest);
$('rest').addEventListener('cancel', event => event.preventDefault());
$('rest-go').addEventListener('click', askRest);

function clearInput() {
  keys.clear();
  touch.clear();
  touchButtons.forEach(button => button.classList.remove('active'));
}

function inputState() {
  const inputs = { gas: false, brake: false, left: false, right: false };
  for (const key of keys) inputs[controls.get(key)] = true;
  for (const direction of touch.values()) inputs[direction] = true;
  return inputs;
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(frame);
}
function frame(t) {
  raf = 0;
  if (screen !== 'drive' || $('paused').open || $('rest').open) return;
  const dt = previous ? Math.min(.05, (t - previous) / 1000) : 0;
  previous = t;
  const input = inputState();
  if (countdown > 0) {
    countdown -= dt;
    const label = countdown > 0 ? String(Math.ceil(countdown)) : '출발!';
    if ($('countdown').textContent !== label) {
      $('countdown').textContent = label;
      beep(countdown > 0 ? 430 : 740);
    }
    if (countdown <= 0) {
      runStarted = true;
      send('hk:start');
    }
  } else {
    $('countdown').hidden = state.elapsed > .65;
    impactAge += dt;
    const previousImpact = state.impact;
    const previousTrafficImpact = state.trafficImpact;
    const wasRunning = !state.outcome;
    if (wasRunning) step(state, input, dt);
    if (state.restStop && !state.outcome) {
      paintHud();
      enterRest();
      return;
    }
    else if (state.outcome === 'wreck') advanceWreck(state, dt);
    const newHit = state.impact !== previousImpact;
    if (newHit) {
      impactAge = 0;
      impactLens.style.setProperty('--impact-side', `${50 + state.impact.side * 30}%`);
      playImpact(state.impact);
    }
    const trafficHit = state.trafficImpact;
    if (!newHit && trafficHit && trafficHit !== previousTrafficImpact && state.elapsed - lastTrafficSound > .44) {
      const distance = Math.hypot(trafficHit.z - state.distance, trafficHit.x - state.x);
      if (distance < 54) {
        playImpact({ ...trafficHit, side: clamp((trafficHit.x - state.x) / 5, -1, 1) }, distance);
        lastTrafficSound = state.elapsed;
      }
    }
    if (state.impact && impactAge < impactDuration) {
      const flash = Math.min(1, impactAge / .026) * Math.max(0, 1 - impactAge / .28) ** 2;
      impactLens.style.opacity = String(flash * state.impact.force * .79);
    }
    if (audio) {
      const load = clamp(state.acceleration / state.car.power, -1, 1);
      engine.frequency.setTargetAtTime(35 + state.speed * 1.12 + load * 8, audio.currentTime, .08);
      const loudness = input.gas && !input.brake ? .089 + Math.max(0, load) * .023 : .050;
      volume.gain.setTargetAtTime(soundEnabled() && !state.outcome ? loudness : 0, audio.currentTime, .1);
    }
    if (wasRunning && state.signal) {
      $('signal').textContent = state.signal;
      $('signal').classList.toggle('hit', newHit);
      $('signal').hidden = false;
      messageFor = 1.18;
      if (!newHit) beep(690);
    }
    messageFor -= dt;
    if (messageFor <= 0 && !$('signal').hidden) $('signal').hidden = true;
    if (wasRunning && state.elapsed >= liveAt) {
      send('hk:live', { score: state.score });
      liveAt = state.elapsed + .6;
    }
  }
  scene.render(state, view, input.brake, impactAge);
  if (t >= hudAt || state.outcome) {
    paintHud();
    hudAt = t + 82;
  }
  if (state.outcome && (state.outcome !== 'wreck' || impactAge >= impactDuration)) finish(state.outcome);
  else schedule();
}

function start() {
  $('garage').close();
  $('results').close();
  $('paused').close();
  $('rest').close();
  wakeAudio();
  clearInput();
  state = createRun(courses[profile.course], modes[profile.mode], carStats(profile.car, profile.upgrades[profile.car]));
  screen = 'drive';
  runStarted = false;
  countdown = 3;
  impactAge = Infinity;
  lastTrafficSound = -Infinity;
  impactLens.style.opacity = '0';
  liveAt = messageFor = previous = hudAt = 0;
  $('home').hidden = true;
  stage.hidden = $('hud').hidden = $('countdown').hidden = false;
  $('countdown').textContent = '3';
  $('signal').hidden = true;
  $('race-label').textContent = state.mode.name;
  paintHud();
  stage.focus();
  send('hk:resumed');
  beep(430);
  schedule();
}

function finish(outcome) {
  if (screen !== 'drive') return;
  screen = 'results';
  quietEngine();
  clearInput();
  $('paused').close();
  const earned = reward(state);
  profile.best = Math.max(profile.best, state.score);
  profile.balance += earned;
  save();
  $('result-mode').textContent = `${state.course.name} · ${state.mode.name}`;
  $('result-title').textContent = titles[outcome];
  $('result-score').textContent = number(state.score);
  $('result-distance').textContent = `${(state.distance / 1000).toFixed(2)} km`;
  $('result-passes').textContent = `${number(state.overtakes)}대`;
  $('result-reward').textContent = `+${number(earned)} 크레딧`;
  $('results').showModal();
  send('hk:resumed');
  if (runStarted) send('hk:score', { score: state.score });
  runStarted = false;
}

function menu() {
  screen = 'home';
  clearInput();
  quietEngine();
  $('results').close();
  $('paused').close();
  stage.hidden = $('hud').hidden = true;
  $('home').hidden = false;
  homeInfo();
  $('start').focus();
  send('hk:resumed');
}

function pause() {
  if (screen !== 'drive') {
    send('hk:resumed');
    return;
  }
  if ($('paused').open) return;
  if ($('rest').open) {
    send('hk:paused');
    return;
  }
  clearInput();
  quietEngine();
  $('paused').showModal();
  send('hk:paused');
}
function resume() {
  if (!$('paused').open) return;
  $('paused').close();
  previous = 0;
  wakeAudio();
  stage.focus();
  send('hk:resumed');
  schedule();
}
function changeView() {
  view = (view + 1) % viewNames.length;
  $('camera').setAttribute('aria-label', `시점 변경 · 현재 ${viewNames[view]}`);
}
async function horn() {
  if (screen !== 'drive' || state.outcome || $('paused').open) return;
  requestYield(state);
  if (!soundEnabled()) return;
  const run = state;
  wakeAudio();
  const clip = soundClips.horn || await hornReady;
  if (!clip || state !== run || screen !== 'drive' || state.outcome || $('paused').open || !soundEnabled()) return;
  const at = audio.currentTime;
  if (activeHorn) {
    activeHorn.gain.gain.setTargetAtTime(0, at, .004);
    activeHorn.source.stop(at + .02);
  }
  const source = audio.createBufferSource();
  source.buffer = clip;
  const gain = audio.createGain();
  gain.gain.value = .70;
  source.connect(gain).connect(impactBus);
  const playback = { source, gain };
  activeHorn = playback;
  source.onended = () => {
    if (activeHorn === playback) activeHorn = null;
    source.disconnect();
    gain.disconnect();
  };
  source.start(at);
}

$('start').addEventListener('click', start);
$('retry').addEventListener('click', start);
$('menu').addEventListener('click', menu);
$('pause').addEventListener('click', pause);
$('resume').addEventListener('click', resume);
$('exit').addEventListener('click', () => runStarted ? finish(state.outcome || 'retired') : menu());
$('camera').addEventListener('click', changeView);
$('horn').addEventListener('click', horn);
$('paused').addEventListener('cancel', event => { event.preventDefault(); resume(); });
$('results').addEventListener('cancel', event => { event.preventDefault(); menu(); });

addEventListener('keydown', event => {
  if (screen !== 'drive') return;
  if ($('rest').open) {
    if (event.code === 'Escape') event.preventDefault();
    return;
  }
  if (event.code === 'Escape' && !event.repeat) {
    event.preventDefault();
    if (embedded) send('hk:esc');
    else if ($('paused').open) resume();
    else pause();
    return;
  }
  if ($('paused').open || event.metaKey || event.ctrlKey || event.altKey) return;
  if (controls.has(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  } else if (!event.repeat && event.code === 'KeyC') changeView();
  else if (!event.repeat && event.code === 'KeyH') horn();
  else if (!event.repeat && event.code === 'KeyE') askRest();
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'drive') pause(); });
touchButtons.forEach(button => {
  button.addEventListener('pointerdown', event => {
    if ($('paused').open || event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touch.set(event.pointerId, button.dataset.drive);
    button.classList.add('active');
  });
  function release(event) {
    touch.delete(event.pointerId);
    if (![...touch.values()].includes(button.dataset.drive)) button.classList.remove('active');
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
});

addEventListener('message', event => {
  if (!embedded || event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === 'hk:hello') {
    hosted = true;
    try { arcadeMuted = localStorage.getItem(arcadeMuteKey) === '1'; } catch { arcadeMuted = false; }
    $('sound').hidden = true;
  } else if (event.data?.type === 'hk:pause') pause();
  else if (event.data?.type === 'hk:resume') resume();
  else if (event.data?.type === 'hk:restart') start();
});
addEventListener('storage', event => {
  if (!hosted || event.key !== arcadeMuteKey) return;
  arcadeMuted = event.newValue === '1';
  if (arcadeMuted) quietEngine();
  else if (screen === 'drive' && !$('paused').open) wakeAudio();
});

$('camera').setAttribute('aria-label', `시점 변경 · 현재 ${viewNames[view]}`);
paintCarSelection();
homeInfo();
send('hk:ready');
