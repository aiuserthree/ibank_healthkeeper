import { advanceWreck, callRest, cars, carStats, clamp, courses, createRun, damageStage, eatFood, foods, leaveRest, MAX_HEALTH, modes, nextRest, carCondition, FUEL_FREE, fuelRate, pumpFuel, serviceCar, shopItems, useShopItem, servicePrice, services, REST_SIGN, restNames, reward, routeMode, SCORE_LIMIT, sectionIndex, step } from './drive.js?v=40';
import { createScene } from './scene.js?v=40';
import { impactDuration } from './impact.js?v=40';
import { assetRoot } from './world.js?v=40';
import { requestYield } from './traffic.js?v=40';
import { createShowroom } from './showroom.js?v=40';
import { dayProgress, dayTime, weatherAt, weatherNames } from './daytime.js?v=40';

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
  // 산 차(owned, 차 shape 이름) — 옛 저장에는 없으니 처음부터 있는 4종만 가진 것으로
  const owned = cars.filter(car => !car.price || (Array.isArray(data?.owned) && data.owned.includes(car.shape))).map(car => car.shape);
  return {
    balance: Number.isSafeInteger(data?.balance) ? Math.max(0, data.balance) : 0,
    best: Number.isSafeInteger(data?.best) ? clamp(data.best, 0, SCORE_LIMIT) : 0,
    car: Number.isInteger(data?.car) && cars[data.car] && owned.includes(cars[data.car].shape) ? data.car : 0,
    owned,
    course: Number.isInteger(data?.course) && courses[data.course] ? data.course : 0,
    // 처음 하는 사람의 주행 모드는 끝없는 질주(운영자 요청) — 이미 고른 사람은 고른 그대로
    mode: Number.isInteger(data?.mode) && modes[data.mode] ? data.mode : Math.max(0, modes.findIndex(item => item.id === 'endless')),
    sound: data?.sound === true,
    // 음악 기본은 무작위(운영자 요청) — 메뉴에서 직접 고른 적이 있으면 그 곡
    music: data?.musicPicked && typeof data?.music === 'string' ? data.music : 'random',
    musicPicked: data?.musicPicked === true,
    lastMusic: typeof data?.lastMusic === 'string' && data.lastMusic ? data.lastMusic : 'random',
    musicVolume: typeof data?.musicVolume === 'number' ? clamp(data.musicVolume, 0, 1) : .45,
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
// 드라이브 음악(운영자 요청) — 힉스필드로 만든 오리지널 5곡(가사 없음). 주행 중에만, 고르기 · 끄기 · 크기, 소리를 끄면 안 남
const tracks = [
  { id: 'citypop', name: '시티팝 · 노을 드라이브' }, { id: 'synthwave', name: '신스웨이브 · 밤 도시' },
  { id: 'acoustic', name: '어쿠스틱 · 아침 국도' }, { id: 'lofi', name: '로파이 · 느긋한 저녁' }, { id: 'rock', name: '록 · 고속도로' },
  // 더 넣음(운영자 요청)
  { id: 'jazz', name: '재즈 · 늦은 밤 국도' }, { id: 'funk', name: '펑크 · 맑은 오후' },
  { id: 'house', name: '하우스 · 질주' }, { id: 'chill', name: '칠아웃 · 새벽 산길' }, { id: 'disco', name: '디스코 · 밤 드라이브' },
];
const music = new Audio();
music.preload = 'none';
// 무작위: 판을 시작할 때마다 한 곡, 곡이 끝나면 다른 곡으로
let shuffled = '';
const pickShuffle = () => {
  const pool = tracks.filter(item => item.id !== shuffled);
  shuffled = pool[Math.floor(Math.random() * pool.length)].id;
};
music.addEventListener('ended', () => {
  if (profile.music !== 'random') return;
  pickShuffle();
  syncMusic();
});

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
const carPicture = car => `${assetRoot}garage/${car.shape}.webp?v=40`;
// 차 단추에 마우스를 올리면(키보드는 포커스, 터치는 누를 때 잠깐) 주행 때와 같은 3D 모델을 패널 옆에 크게 띄운다
const carStage = $('car-stage');
const showroom = createShowroom(carStage.querySelector('canvas'), cars,
  () => screen === 'home' && !$('home').hidden && carStage.classList.contains('open'));
const portraits = showroom ? showroom.portraits(600, 260) : [];
// picture: 힉스필드로 그린 차고 그림이 있는 차(스틸 로드스터 — 운영자 요청)는 3D 사진 대신 그 그림을 쓴다
const carPortrait = (car, i) => car.picture ? carPicture(car) : portraits[i] || carPicture(car);
if (!showroom) {
  carStage.classList.add('still');
  $('car-still').hidden = false;
}
// 값(price)이 있는 차는 차고에서 보유 크레딧으로 산 뒤에만 탈 수 있다
const owns = i => !cars[i].price || profile.owned.includes(cars[i].shape);
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
let carInputs = [];
// 첫 화면 차 고르기 — 가진 차만, 아직 안 산 차가 있으면 끝에 「새 차」 칸(누르면 차고)
function carChoices() {
  const mine = cars.map((_, i) => i).filter(owns);
  const left = cars.length - mine.length;
  const count = mine.length + (left ? 1 : 0);
  carOptions.style.setProperty('--cols', count <= 5 ? count : Math.ceil(count / 2));
  carOptions.innerHTML = mine.map(i => `
  <div>
    <input id="car-${i}" type="radio" name="car" value="${i}">
    <label class="car-option" for="car-${i}">
      <img src="${carPortrait(cars[i], i)}" width="600" height="260" alt="">
      <span>${cars[i].name}</span>
    </label>
  </div>`).join('') + (left ? `<button type="button" class="car-option car-shop" id="car-shop"><b aria-hidden="true">＋</b><span>새 차 ${left}대</span></button>` : '');
  carInputs = [...carOptions.querySelectorAll('input')];
}
carChoices();
function paintCarSelection() {
  const input = carInputs.find(item => Number(item.value) === profile.car);
  if (input) {
    input.checked = true;
    // 낮은 화면(휴대폰 가로)에서는 차 단추가 옆으로 넘기는 한 줄 — 고른 차가 보이게 옮긴다
    const box = input.parentElement.getBoundingClientRect(), row = carOptions.getBoundingClientRect();
    if (box.width && (box.left < row.left || box.right > row.right)) carOptions.scrollLeft += box.left - row.left - (row.width - box.width) / 2;
  }
  const car = carStats(profile.car, profile.upgrades[profile.car]);
  $('car-spec').textContent = `최고 ${car.top} km/h · 가속 ${car.power.toFixed(1)}`;
}
const optionIndex = event => {
  const label = event.target.closest?.('label.car-option');
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
carOptions.addEventListener('click', event => {
  if (!event.target.closest('#car-shop')) return;
  unpeek(0);
  openGarage(cars.findIndex((_, i) => !owns(i)));
});
carStage.addEventListener('pointerenter', () => clearTimeout(peekTimer));
carStage.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') unpeek(); });
carOptions.addEventListener('change', event => {
  profile.car = Number(event.target.value);
  save();
  paintCarSelection();
  if (event.target.matches(':focus-visible')) peek(profile.car, 'focus');
});

// 차고 — 왼쪽 큰 3D 무대(앞 · 옆 · 뒤 단추, 끌어서 돌리기), 오른쪽 차 목록. 안 산 차도 미리 볼 수 있고, 크레딧이 되면 「사기」(한 번 더 눌러 확정)
const upgradeCost = (i, level) => 220 + i * 85 + level * 155;
let garageRoom = null;
let focusCar = 0;
let confirmCar = -1;
let confirmTimer = 0;
function garageFocus() {
  const i = focusCar;
  const car = cars[i];
  const mine = owns(i);
  const level = profile.upgrades[i];
  const stats = carStats(i, level);
  $('garage-name').textContent = car.name;
  $('garage-tag').textContent = car.tag || '처음부터 있는 차';
  $('garage-stats').innerHTML = `<span>최고 ${stats.top} km/h</span><span>가속 ${stats.power.toFixed(1)}</span><span>손맛 ${stats.grip.toFixed(1)}</span>${mine ? `<span>강화 ${level}/${maxUpgrade}</span>` : ''}`;
  $('garage-lock').hidden = mine;
  if (mine) {
    const equipped = profile.car === i;
    const price = upgradeCost(i, level);
    $('garage-actions').innerHTML = `
      <button type="button" class="button ${equipped ? 'quiet' : 'primary'}" data-action="equip" ${equipped ? 'disabled' : ''}>${equipped ? '타는 중' : '이 차 고르기'}</button>
      <button type="button" class="button quiet" data-action="upgrade" ${level >= maxUpgrade || profile.balance < price ? 'disabled' : ''}>${level >= maxUpgrade ? '강화 완료' : '강화 · ◆ ' + number(price)}</button>`;
  } else {
    const short = car.price - profile.balance;
    const asking = confirmCar === i;
    $('garage-actions').innerHTML = `
      <button type="button" class="button primary buy${asking ? ' asking' : ''}" data-action="buy" ${short > 0 ? 'disabled' : ''}>${short > 0
        ? `사기 · ◆ ${number(car.price)} <small>(${number(short)} 모자람)</small>` : asking ? `한 번 더 누르면 구매 · ◆ ${number(car.price)}` : `사기 · ◆ ${number(car.price)}`}</button>`;
  }
  if (garageRoom) garageRoom.show(i);
  else $('garage-still').src = carPortrait(car, i);
}
function garageInfo(focus) {
  $('garage-balance').textContent = number(profile.balance);
  $('car-list').innerHTML = cars.map((car, i) => {
    const mine = owns(i);
    const note = profile.car === i ? '타는 중' : mine ? `보유 · 강화 ${profile.upgrades[i]}/${maxUpgrade}` : `🔒 ◆ ${number(car.price)}`;
    return `<button type="button" class="car-card${profile.car === i ? ' current' : ''}${mine ? '' : ' locked'}${focusCar === i ? ' focused' : ''}" data-pick="${i}" aria-pressed="${focusCar === i}">
      <img class="car-portrait" src="${carPortrait(car, i)}" width="600" height="260" alt="">
      <span class="car-name">${car.name}</span><span class="car-note${!mine && car.price <= profile.balance ? ' ready' : ''}">${note}</span>
    </button>`;
  }).join('');
  garageFocus();
  if (focus) ($('garage').querySelector(focus) || $('close-garage')).focus();
}
function openGarage(i = profile.car) {
  focusCar = i;
  confirmCar = -1;
  $('garage-status').textContent = '';
  if (!garageRoom && showroom) garageRoom = createShowroom($('garage-canvas'), cars, () => $('garage').open && !document.hidden);
  $('garage-still').hidden = !!garageRoom;
  garageInfo();
  $('garage').showModal();
  $('car-list').querySelector(`[data-pick="${i}"]`)?.scrollIntoView({ block: 'nearest' });
}
$('garage-button').addEventListener('click', () => openGarage());
$('close-garage').addEventListener('click', () => $('garage').close());
$('garage').addEventListener('click', event => {
  const turn = event.target.closest('[data-turn]');
  if (turn) garageRoom?.turnTo(turn.dataset.turn);
});
$('car-list').addEventListener('click', event => {
  const card = event.target.closest('[data-pick]');
  if (!card) return;
  focusCar = Number(card.dataset.pick);
  confirmCar = -1;
  $('garage-status').textContent = '';
  garageInfo(`[data-pick="${focusCar}"]`);
});
$('garage-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const i = focusCar;
  const car = cars[i];
  const { action } = button.dataset;
  clearTimeout(confirmTimer);
  if (action === 'buy' && !owns(i)) {
    if (profile.balance < car.price) return;
    if (confirmCar !== i) {
      // 잘못 눌러 큰 크레딧이 나가지 않게 — 한 번 더 눌러야 산다(4초 지나면 원래대로)
      confirmCar = i;
      confirmTimer = setTimeout(() => { confirmCar = -1; garageFocus(); }, 4000);
      garageFocus();
      $('garage-actions').querySelector('[data-action="buy"]')?.focus();
      return;
    }
    confirmCar = -1;
    profile.balance -= car.price;
    profile.owned.push(car.shape);
    profile.car = i;
    $('garage-status').textContent = `${car.name} 구매 완료! 바로 이 차로 달립니다`;
    carChoices();
  } else if (action === 'equip' && owns(i)) {
    profile.car = i;
    $('garage-status').textContent = `${car.name} 선택 완료`;
  } else if (action === 'upgrade' && owns(i) && profile.upgrades[i] < maxUpgrade) {
    const price = upgradeCost(i, profile.upgrades[i]);
    if (profile.balance < price) return;
    profile.balance -= price;
    profile.upgrades[i]++;
    $('garage-status').textContent = `${car.name} ${profile.upgrades[i]}단계 강화 완료`;
  } else return;
  save();
  garageInfo(action === 'upgrade' ? '[data-action="upgrade"]:not(:disabled)' : `[data-pick="${i}"]`);
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
  const clockLabel = `${dayTime(dayProgress(state), true).clock} · ${weatherNames[weatherAt(course, distance).kind]}`;
  if ($('race-clock').textContent !== clockLabel) $('race-clock').textContent = clockLabel;
  $('fuel-bar').style.transform = `scaleX(${state.fuel})`;
  $('fuel').setAttribute('aria-valuenow', String(Math.round(state.fuel * 100)));
  $('fuel').classList.toggle('low', state.fuel < .2);
  $('hunger-bar').style.transform = `scaleX(${state.hunger})`;
  $('hunger').setAttribute('aria-valuenow', String(Math.round(state.hunger * 100)));
  $('hunger').classList.toggle('low', state.hunger < .2);
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
  // E 를 누른 뒤에도 남은 거리를 계속 보여 준다(운영자 요청)
  const left = rest.left >= 1000 ? (rest.left / 1000).toFixed(1) + ' km' : Math.round(rest.left / 10) * 10 + ' m';
  $('rest-sign-left').textContent = called ? `${left} 남음 · 들르는 중` : left;
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
let restBought = new Set();
let restServiced = new Set();
function restTab(name) {
  $('rest-scene').dataset.scene = name === 'food' ? 'food' : 'station';
}
function paintRest() {
  $('tank-bar').style.transform = `scaleX(${state.fuel})`;
  $('tank-value').textContent = `${Math.round(state.fuel * 100)}%`;
  $('refuel').disabled = state.fuel >= .995;
  $('shop-balance').textContent = number(profile.balance);
  const icons = { repair: '🔧', tire: '🛞', oil: '🛢️' };
  $('service-list').innerHTML = services.map(item => {
    const price = servicePrice(state, item.id);
    const done = restServiced.has(item.id);
    const needless = !done && !price;
    const short = !done && !needless && profile.balance < price;
    const cond = carCondition(state, item.id);
    const level = cond.value > .7 ? 'good' : cond.value > .35 ? 'mid' : 'bad';
    return `<button type="button" class="service ${done ? 'done' : ''}" data-service="${item.id}" ${done || needless || short ? 'disabled' : ''}>
      <span aria-hidden="true">${icons[item.id]}</span><b>${item.name}</b>
      <i class="cond ${level}"><b style="transform: scaleX(${cond.value.toFixed(3)})"></b></i>
      <small>${cond.text}</small>
      <em>${done ? `${item.done} ✓` : needless ? '상태 좋음' : short ? `${number(price - profile.balance)} 모자람` : '◆ ' + number(price)}</em>
    </button>`;
  }).join('');
  $('belly-bar').style.transform = `scaleX(${state.hunger})`;
  $('belly-value').textContent = `${Math.round(state.hunger * 100)}%`;
  $('rest-balance').textContent = number(profile.balance);
  const eaten = foods.filter(food => restEaten.has(food.id)).map(food => food.name);
  $('eaten-list').textContent = eaten.length ? `먹은 것 · ${eaten.join(', ')}` : '키오스크에서 골라 담고 결제하면 번호로 불러 줘요';
  $('open-kiosk').disabled = eaten.length === foods.length;
}
// 휴게소 안내 글 — 두 줄이 되어도 「다시 출발」 단추에 가리지 않게 보이는 곳까지 스크롤(운영자 요청)
function restSay(text) {
  $('rest-status').textContent = text;
  showRestStatus();
}
// 덮개 화면(편의점 · 키오스크 · 주유)을 닫고 패널이 다시 보일 때도 안내 글이 보이게
function showRestStatus() {
  // 안내 글은 「다시 출발」 바로 위 — 패널을 맨 아래로 내리면 보인다(단추가 덮는 자리라 scrollIntoView 로는 안 내려감)
  if ($('rest-status').textContent) requestAnimationFrame(() => { const panel = $('rest-status').closest('.rest-panel'); panel.scrollTop = panel.scrollHeight; });
}
function enterRest() {
  clearInput();
  quietEngine();
  restEaten = new Set();
  restBought = new Set();
  restServiced = new Set();
  $('rest-title').textContent = restNames[state.restStop.index % restNames.length];
  $('rest-status').textContent = '';
  restTab('station');
  paintRest();
  $('rest').showModal();
  syncCursor();
  send('hk:paused');
  // 도착하면 주유 영상(차가 들어와 주유기 옆에 서는 장면)부터 — 끝나거나 건너뛰면 휴게소 화면(운영자 요청)
  playMovie('refuel', '휴게소에 들어가는 중…', () => ($('refuel').disabled
    ? $('open-kiosk') : $('refuel')).focus());
}
function departRest() {
  if (!$('rest').open || $('rest').classList.contains('watching') || !$('pump').hidden || !$('kiosk').hidden || !$('store').hidden) return;
  $('rest').close();
  leaveRest(state);
  previous = 0;
  wakeAudio();
  stage.focus();
  paintHud();
  send('hk:resumed');
  schedule();
}
// 식당 쪽에 마우스 · 포커스가 가면 배경이 식당 안으로, 주유소 쪽이면 바깥으로
for (const [part, scene] of [['rest-station', 'station'], ['rest-food', 'food']]) {
  $(part).addEventListener('pointerenter', () => restTab(scene));
  $(part).addEventListener('focusin', () => restTab(scene));
}
// 휴게소 영상: 주유(6초) · 메뉴별 음식(4초)을 화면 가득 보여 주고, 끝나거나 건너뛰면 효과가 붙는다 — 영상을 못 불러오면 바로
const refuelVideo = $('refuel-video');
const movieRoot = `${assetRoot}rest/`;
let movieDone = null;
function playMovie(name, caption, done) {
  movieDone = done;
  $('rest').classList.add('watching');
  $('refuel-movie').hidden = false;
  $('refuel-caption').textContent = caption;
  refuelVideo.src = `${movieRoot}${name}.mp4?v=4`;
  refuelVideo.play().catch(endMovie);
  $('refuel-skip').focus();
}
function endMovie() {
  if (!$('rest').classList.contains('watching')) return;
  refuelVideo.pause();
  $('refuel-movie').hidden = true;
  $('rest').classList.remove('watching');
  const done = movieDone;
  movieDone = null;
  done?.();
}
// 직접 주유하기(운영자 요청) — 기름 고르기 → 노즐을 주유구로 끌어 꽂기 → 꾹 눌러 넣기(90~100%에서 떼면 딱 맞게 +100점) → 영수증
const pump = { step: '', grade: 'regular', added: 0, holding: false, last: 0, frame: 0, drag: null, total: 0, paid: 0, bonus: false, spilled: 0 };
const holster = { x: .234, y: .50 }, door = { x: .827, y: .625 };
// 호스 — 주유기 아래쪽에서 노즐 손잡이 끝까지 늘어지는 곡선(운영자 요청: 꽂힐 때 선이 이어지게)
const hoseRoot = { x: .115, y: .78 };
function drawHose(x, y) {
  const plugged = $('nozzle').classList.contains('plugged');
  // 노즐 그림의 호스 끝(그림 왼쪽 아래 0% · 92%)을 CSS 이동 · 회전대로 계산한 자리 — 걸이(-8°)와 꽂힘(10°)
  const end = plugged ? { x: x - .1147, y: y + .024 } : { x: x - .0339, y: y + .0563 };
  const [x0, y0, x1, y1] = [hoseRoot.x * 1600, hoseRoot.y * 905, end.x * 1600, end.y * 905];
  const sag = Math.max(120, Math.abs(x1 - x0) * .45);
  // 노즐의 호스 토막 방향(그림 속 왼쪽 아래 약 136°)에 회전(-8° · 10°)을 더한 쪽으로 곡선이 빠져나오게 — 이음매가 꺾이지 않게
  const angle = (136 + (plugged ? 10 : -8)) * Math.PI / 180;
  const pull = Math.max(140, Math.hypot(x1 - x0, y1 - y0) * .35);
  const c2 = [x1 + Math.cos(angle) * pull, y1 + Math.sin(angle) * pull];
  const d = `M${x0} ${y0} C${x0 + 40} ${y0 + sag}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${x1} ${y1}`;
  $('hose').setAttribute('d', d);
  $('hose-shine').setAttribute('d', d);
}
function placeNozzle(x, y) {
  const nozzle = $('nozzle');
  nozzle.style.left = `${x * 100}%`;
  nozzle.style.top = `${y * 100}%`;
  drawHose(x, y);
}
function pumpStep(step) {
  pump.step = step;
  $('pump-step').textContent = {
    grade: '기름을 고르세요',
    nozzle: '주유기에서 노즐을 끌어다 차 주유구에 꽂으세요',
    fill: '꾹 누르는 동안 기름이 들어가요 — 100% 가 되면 저절로 멈춰요 · 90% 넘어서 떼면 딱 맞게!',
    done: '주유 끝',
  }[step];
  $('grades').hidden = step !== 'grade';
  $('pump-plug').hidden = step !== 'nozzle';
  $('pump-meter').hidden = step !== 'fill' && step !== 'done';
  $('pump-hold').hidden = step !== 'fill';
  $('receipt').hidden = step !== 'done';
  $('pump-close').hidden = step === 'done';
  $('pump-more').hidden = step !== 'done' || state.fuel >= .995 || pump.broke;
  $('fuel-door').classList.toggle('target', step === 'nozzle');
  ({ grade: () => $('grades').querySelector('button')?.focus(), nozzle: () => $('pump-plug').focus(),
    fill: () => $('pump-hold').focus(), done: () => $('pump-done').focus() })[step]?.();
}
function paintPump() {
  const level = state.fuel + pump.added;
  $('pump-fill').style.transform = `scaleX(${Math.min(1, level)})`;
  $('pump-fill').classList.toggle('over', level > 1);
  $('pump-value').textContent = `${Math.round(level * 100)}%`;
  const free = Math.max(0, FUEL_FREE - state.fuel);
  $('pump-cost').textContent = `◆ ${number(Math.max(0, Math.ceil(Math.max(0, pump.added - free) * 100 * fuelRate(pump.grade) - 1e-6)))}`;
}
function pumpTick(t) {
  if (!pump.holding) return;
  const dt = pump.last ? Math.min(.05, (t - pump.last) / 1000) : 0;
  pump.last = t;
  // 흘리지 않는다(운영자 요청) — 100% 가 되면 저절로 멈춘다
  // 살 수 있는 만큼만(비상 주유 30% 까지는 무료) — 크레딧이 떨어지면 거기서 멈춘다
  const free = Math.max(0, FUEL_FREE - state.fuel);
  const affordable = free + profile.balance / (100 * fuelRate(pump.grade));
  const cap = Math.min(1 - state.fuel, affordable);
  pump.added = Math.min(cap, pump.added + dt * .22);
  if (pump.added >= cap - .0005) pump.added = cap; // 끝까지 넣었으면 남은 빈자리를 정확히 채운다(99.6% 같은 값이 100% 로만 보이지 않게)
  paintPump();
  if (pump.added >= cap) {
    pump.broke = cap < 1 - state.fuel - .001;
    holdPump(false);
    return;
  }
  pump.frame = requestAnimationFrame(pumpTick);
}
function holdPump(on) {
  if (pump.step !== 'fill' || pump.holding === on) return;
  pump.holding = on;
  if (on) {
    pump.last = 0;
    beep(330, .08);
    pump.frame = requestAnimationFrame(pumpTick);
    return;
  }
  cancelAnimationFrame(pump.frame);
  // 1% 도 안 되게 살짝 눌렀다 뗀 것은 무시 — 다만 99% 처럼 빈자리가 1% 보다 작아 그만큼 가득 채운 것은 넣은 것으로 친다
  // (예전엔 이것도 무시해서 게이지만 100% 로 보이고 실제론 안 들어가, 다음으로 안 넘어가고 그만두면 다시 99% 였다)
  const full = pump.added > 0 && pump.added >= 1 - state.fuel - .0005;
  if (pump.added < .01 && !full) return;
  // 계속 넣기를 위해 넣은 만큼씩 결제 — 딱 맞게 보너스는 주유를 마칠 때 한 번(앞에서 받았으면 다시 안 줌)
  const result = pumpFuel(state, pump.added, pump.grade, !pump.bonus);
  profile.balance = Math.max(0, profile.balance - result.cost);
  save();
  $('balance').textContent = number(profile.balance);
  pump.free = (pump.free || 0) + result.free;
  pump.total += pump.added;
  pump.paid += result.cost;
  pump.spilled += result.spilled;
  if (result.exact) pump.bonus = true;
  pump.added = 0;
  const lines = [`넣은 양 +${Math.round(pump.total * 100)}% → ${Math.round(result.level * 100)}%`, `결제 ◆ ${number(pump.paid)} 크레딧${pump.free > .005 ? ` (비상 주유 ${Math.round(pump.free * 100)}% 무료)` : ''}`];
  if (pump.broke) lines.push('크레딧이 모자라 여기까지 넣었어요');
  if (pump.bonus) lines.push('딱 맞게! +100점');
  if (result.level >= .999) lines.push('가득 찼어요');
  if (pump.grade === 'premium') lines.push('고급 휘발유 — 3 km 동안 가속 +12%');
  $('receipt-text').innerHTML = lines.map(line => `<span>${line}</span>`).join('');
  beep(result.exact ? 880 : 520, .14);
  // 게이지는 떼던 순간 그대로 둔다(결제 뒤 state.fuel 에 이미 더해져 다시 그리면 두 번 더해짐)
  pumpStep('done');
}
function openPump() {
  pump.added = pump.total = pump.paid = pump.spilled = pump.free = 0;
  pump.broke = false;
  pump.bonus = false;
  pump.holding = false;
  $('nozzle').classList.remove('plugged');
  placeNozzle(holster.x, holster.y);
  $('rest').classList.add('pumping');
  $('pump').hidden = false;
  paintPump();
  pumpStep('grade');
}
function closePump() {
  cancelAnimationFrame(pump.frame);
  pump.holding = false;
  $('pump').hidden = true;
  $('rest').classList.remove('pumping');
  if (pump.step === 'done') restSay(`주유 끝 — 기름 ${Math.round(state.fuel * 100)}%`);
  pump.step = '';
  paintRest();
  $('depart').focus({ preventScroll: true });
  showRestStatus();
}
function plugNozzle() {
  $('nozzle').classList.add('plugged');
  placeNozzle(door.x, door.y);
  beep(620, .07);
  pumpStep('fill');
}
$('refuel').addEventListener('click', openPump);
$('grades').addEventListener('click', event => {
  const button = event.target.closest('[data-grade]');
  if (!button) return;
  pump.grade = button.dataset.grade;
  pumpStep('nozzle');
});
$('pump-plug').addEventListener('click', plugNozzle);
$('nozzle').addEventListener('pointerdown', event => {
  if (pump.step !== 'nozzle') return;
  event.preventDefault();
  $('nozzle').setPointerCapture(event.pointerId);
  pump.drag = $('pump-frame').getBoundingClientRect();
});
$('nozzle').addEventListener('pointermove', event => {
  if (!pump.drag) return;
  const { left, top, width, height } = pump.drag;
  placeNozzle(clamp((event.clientX - left) / width, 0, 1), clamp((event.clientY - top) / height, 0, 1));
});
$('nozzle').addEventListener('pointerup', event => {
  if (!pump.drag) return;
  const { left, top, width, height } = pump.drag;
  pump.drag = null;
  const x = (event.clientX - left) / width, y = (event.clientY - top) / height;
  if (Math.hypot(x - door.x, (y - door.y) * height / width) < .08) plugNozzle();
  else placeNozzle(holster.x, holster.y);
});
for (const [type, on] of [['pointerdown', true], ['pointerup', false], ['pointerleave', false], ['pointercancel', false]]) {
  $('pump-hold').addEventListener(type, event => {
    if (type === 'pointerdown') event.preventDefault();
    holdPump(on);
  });
}
addEventListener('keydown', event => {
  if ($('pump').hidden) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (pump.step === 'done' && !$('pump-more').hidden && !event.repeat) { paintPump(); pumpStep('fill'); }
    if (!event.repeat) holdPump(true);
  } else if (event.code === 'Enter' && pump.step === 'nozzle') {
    event.preventDefault();
    plugNozzle();
  }
});
addEventListener('keyup', event => { if (event.code === 'Space' && !$('pump').hidden) holdPump(false); });
$('pump-done').addEventListener('click', closePump);
// 계속 넣기 — 꽂힌 그대로 다시 꾹 눌러 더 넣는다
$('pump-more').addEventListener('click', () => { paintPump(); pumpStep('fill'); });
$('pump-close').addEventListener('click', closePump);
$('pump-movie').addEventListener('click', () => {
  closePump();
  playMovie('refuel', '주유 영상', () => $('depart').focus());
});
$('service-list').addEventListener('click', event => {
  const button = event.target.closest('[data-service]');
  if (!button || button.disabled) return;
  const id = button.dataset.service;
  const price = servicePrice(state, id);
  if (!price || profile.balance < price) return;
  profile.balance -= price;
  save();
  serviceCar(state, id);
  restServiced.add(id);
  const item = services.find(entry => entry.id === id);
  restSay(`${item.done} — ${carCondition(state, id).text}`);
  beep(640, .1);
  $('balance').textContent = number(profile.balance);
  paintRest();
  paintHud();
});
refuelVideo.addEventListener('ended', endMovie);
refuelVideo.addEventListener('error', endMovie);
$('refuel-skip').addEventListener('click', endMovie);
// 편의점(운영자 요청) — 진열대에서 골라 담고, 직원과 대화(내 차 상태 · 날씨 · 시간에 맞춘 추천) → 계산 대화 → 효과
let basket = [];
let storeStep = '';
// 직원 — 들를 때마다 남자(clerk) · 여자(clerk2) 중 무작위(운영자 요청)
let clerkSet = 'clerk';
const basketTotal = () => basket.reduce((sum, id) => sum + shopItems.find(item => item.id === id).price, 0);
function clerkSay(text, choices = [], talking = true) {
  $('bubble').textContent = text;
  $('clerk').src = `${assetRoot}rest/${clerkSet}-${talking ? 'talk' : 'smile'}.webp?v=1`;
  clearTimeout(clerkSay.timer);
  clerkSay.timer = setTimeout(() => { $('clerk').src = `${assetRoot}rest/${clerkSet}-smile.webp?v=1`; }, 1400);
  $('choices').innerHTML = choices.map(([key, label]) => `<button type="button" class="button quiet" data-say="${key}">${label}</button>`).join('');
  beep(520 + Math.random() * 80, .04);
  $('choices').querySelector('button')?.focus();
}
function advice() {
  const weather = weatherAt(state.course, state.distance).kind;
  const day = dayTime(dayProgress(state), true);
  if (state.fuel < .3) return '기름이 얼마 안 남았네요. 나가실 때 주유소 꼭 들르세요!';
  if (state.tire < .3 || state.oil < .2) return '차가 좀 지쳐 보여요. 옆 정비소에서 타이어랑 오일 한번 보세요.';
  if (state.hunger < .4) return '출출하시죠? 삼각김밥 하나면 든든해요.';
  if (weather === 'rain' || weather === 'snow') return `${weatherNames[weather]} 와서 길이 미끄러워요. 천천히 가세요!`;
  if (day.night > .5) return '밤길엔 졸음이 제일 무서워요. 에너지음료나 껌 챙기세요.';
  return '오늘 날 좋네요! 감자칩이랑 음료 하나 들고 달리면 딱이죠.';
}
function paintStore() {
  $('store-balance').textContent = number(profile.balance);
  $('goods').innerHTML = shopItems.map(item => {
    const bought = restBought.has(item.id), taken = basket.includes(item.id);
    const off = bought || taken || storeStep === 'checkout';
    return `<button type="button" class="dish ${bought || taken ? 'eaten' : ''}" data-good="${item.id}" ${off ? 'disabled' : ''} title="${item.effect}">
      <img src="${assetRoot}rest/shop-${item.id}.webp?v=1" width="256" height="256" alt="">
      <b>${item.name}</b><em>${bought ? '샀어요' : taken ? '담았어요' : '◆ ' + number(item.price)}</em>
    </button>`;
  }).join('');
  // 바구니 — 담은 것마다 × 로 뺄 수 있다(운영자 요청), 계산 중에는 못 뺌
  const locked = storeStep === 'checkout' || storeStep.startsWith('pay') || storeStep === 'done';
  $('basket').innerHTML = basket.length
    ? `<span>바구니 · ◆ ${number(basketTotal())}</span>` + basket.map(id => `<button type="button" class="pick" data-unpick="${id}" ${locked ? 'disabled' : ''} aria-label="${shopItems.find(item => item.id === id).name} 빼기">${shopItems.find(item => item.id === id).name} ×</button>`).join('')
    : '진열대에서 눌러 담으세요';
}
const shopping = () => ['buy', '계산할게요'];
function openStore() {
  basket = [];
  storeStep = 'greet';
  clerkSet = Math.random() < .5 ? 'clerk' : 'clerk2';
  $('store').hidden = false;
  $('rest').classList.add('pumping');
  paintStore();
  clerkSay(`어서 오세요! ${restNames[state.restStop.index % restNames.length]} 편의점이에요. 어디까지 가세요?`,
    [['far', '끝까지 달려요'], ['browse', '그냥 둘러볼게요'], ['tip', '뭐 추천해 줄래요?']]);
}
function closeStore() {
  $('store').hidden = true;
  $('rest').classList.remove('pumping');
  storeStep = '';
  paintRest();
  $('open-store').focus({ preventScroll: true });
  showRestStatus();
}
$('open-store').addEventListener('click', openStore);
$('basket').addEventListener('click', event => {
  const button = event.target.closest('[data-unpick]');
  if (!button || button.disabled) return;
  basket = basket.filter(id => id !== button.dataset.unpick);
  paintStore();
  const name = shopItems.find(item => item.id === button.dataset.unpick).name;
  clerkSay(`${name} 빼 드렸어요.`, basket.length ? [shopping(), ['more', '더 볼게요'], ['leave', '나갈게요']] : [['more', '더 볼게요'], ['leave', '나갈게요']], false);
});
$('goods').addEventListener('click', event => {
  const button = event.target.closest('[data-good]');
  if (!button || button.disabled) return;
  basket.push(button.dataset.good);
  storeStep = 'shop';
  paintStore();
  const item = shopItems.find(entry => entry.id === button.dataset.good);
  const lines = { chips: '감자칩은 늘 인기예요!', chocobar: '달달한 게 힘 나죠.', energy: '이거 마시면 눈이 번쩍 뜨여요.', water: '물은 꼭 챙기셔야죠.', gimbap: '오늘 들어온 거라 신선해요.', gum: '껌 씹으면 덜 졸려요.', cupramen: '뜨거운 물은 저쪽에 있어요!', bananamilk: '휴게소엔 역시 바나나우유죠.', icecream: '녹기 전에 드세요~', jelly: '심심할 때 하나씩 드세요.', jerky: '씹을수록 고소해요.', vitamin: '피곤할 때 딱이에요.' };
  clerkSay(`${lines[item.id]} (${item.effect})`, [shopping(), ['more', '더 볼게요'], ['leave', '나갈게요']]);
});
$('choices').addEventListener('click', event => {
  const button = event.target.closest('[data-say]');
  if (!button) return;
  const say = button.dataset.say;
  const total = basketTotal();
  if (say === 'far') clerkSay(`멀리 가시네요! ${advice()}`, [['browse', '둘러볼게요'], ['leave', '나갈게요']]);
  else if (say === 'tip') clerkSay(advice(), [['browse', '고마워요, 둘러볼게요'], ['leave', '나갈게요']]);
  else if (say === 'browse' || say === 'more') { storeStep = 'shop'; paintStore(); clerkSay('천천히 보세요~ 진열대에서 고르시면 돼요.', basket.length ? [shopping(), ['leave', '나갈게요']] : [['leave', '나갈게요']], false); }
  else if (say === 'buy') {
    if (!basket.length) { clerkSay('아직 고르신 게 없어요!', [['browse', '둘러볼게요'], ['leave', '나갈게요']]); return; }
    storeStep = 'checkout';
    paintStore();
    if (total > profile.balance) {
      clerkSay(`${basket.length}개에 ◆ ${number(total)}인데… 크레딧이 ◆ ${number(total - profile.balance)} 모자라요. 하나 빼 드릴까요?`, [['drop', '마지막 거 뺄게요'], ['leave', '다음에 올게요']]);
      return;
    }
    clerkSay(`${basket.length}개, ◆ ${number(total)} 크레딧입니다. 봉투 필요하세요?`, [['bag', '네, 주세요(◆ 2)'], ['nobag', '아니요, 괜찮아요']]);
  } else if (say === 'drop') {
    basket.pop();
    storeStep = 'shop';
    paintStore();
    clerkSay('뺐어요! 다시 계산해 드릴까요?', basket.length ? [shopping(), ['more', '더 볼게요']] : [['more', '더 볼게요'], ['leave', '나갈게요']]);
  } else if (say === 'bag' || say === 'nobag') {
    if (storeStep !== 'checkout') return;
    const bag = say === 'bag' && profile.balance >= total + 2 ? 2 : 0;
    storeStep = `pay:${bag}`;
    clerkSay('포인트 적립해 드릴까요?', [['point', '네, 적립해 주세요'], ['nopoint', '괜찮아요']]);
  } else if (say === 'point' || say === 'nopoint') {
    // 결제는 「결제 대기」 단계에서 한 번만 — 단추가 겹쳐 눌려도 두 번 빠지지 않게(시험 중 한 번 크레딧이 더 빠진 적이 있어 막아 둠)
    if (!storeStep.startsWith('pay:')) return;
    const bag = Number(storeStep.split(':')[1] || 0);
    storeStep = 'paying';
    const point = say === 'point' ? Math.max(1, Math.round(total * .05)) : 0;
    profile.balance = Math.max(0, profile.balance - total - bag + point);
    save();
    $('balance').textContent = number(profile.balance);
    for (const id of basket) { useShopItem(state, id); restBought.add(id); }
    const bought = basket.map(id => shopItems.find(item => item.id === id).name);
    basket = [];
    storeStep = 'done';
    paintStore();
    paintHud();
    restSay(bought.length > 2 ? `편의점에서 ${bought.length}개 샀어요 · ${bought[0]} 외 ${bought.length - 1}개` : `편의점에서 ${bought.join(', ')} 샀어요`);
    clerkSay(`결제됐어요${point ? ` · 포인트 ◆ ${point} 적립!` : ''} 감사합니다, 안전 운전하세요!`, [['leave', '나가기']]);
  } else if (say === 'leave') {
    basket = [];
    closeStore();
  }
});
addEventListener('keydown', event => {
  if ($('store').hidden || event.code !== 'Escape') return;
  closeStore();
});

// 식당 키오스크(운영자 요청) — 담기 → 결제(이번 주행 점수) → 주문 번호 · 조리 중 → 「○번 고객님」 → 받으러 가기 → 먹는 영상 차례로 · 효과
let cart = [];
let cookFrame = 0;
const cartTotal = () => cart.reduce((sum, id) => sum + foods.find(food => food.id === id).price, 0);
function paintKiosk() {
  $('kiosk-score').textContent = number(profile.balance);
  $('menu-list').innerHTML = foods.map(food => {
    const eaten = restEaten.has(food.id), taken = cart.includes(food.id);
    return `<button type="button" class="dish ${eaten || taken ? 'eaten' : ''}" data-food="${food.id}" ${eaten || taken ? 'disabled' : ''}>
      <img src="${assetRoot}rest/${food.id}.webp?v=1" width="256" height="256" alt="">
      <b>${food.name}</b><small>${food.effect}</small>
      <em>${eaten ? '먹었어요' : taken ? '담았어요' : '◆ ' + number(food.price)}</em>
    </button>`;
  }).join('');
  $('cart-list').innerHTML = cart.length ? cart.map(id => {
    const food = foods.find(item => item.id === id);
    return `<li><span>${food.name}</span><em>${number(food.price)}</em><button type="button" data-remove="${id}" aria-label="${food.name} 빼기">×</button></li>`;
  }).join('') : '<li class="empty">메뉴를 눌러 담으세요</li>';
  const total = cartTotal();
  $('cart-total').textContent = number(total);
  $('kiosk-pay').disabled = !cart.length || total > profile.balance;
  $('kiosk-pay').textContent = cart.length && total > profile.balance ? `크레딧 ${number(total - profile.balance)} 모자라요` : '결제하기';
}
function openKiosk() {
  cart = [];
  $('kiosk-order').hidden = false;
  $('kiosk-wait').hidden = true;
  $('kiosk-close').hidden = false;
  $('kiosk').hidden = false;
  $('rest').classList.add('pumping');
  restTab('food');
  paintKiosk();
  $('menu-list').querySelector('button:not(:disabled)')?.focus();
}
function closeKiosk() {
  cancelAnimationFrame(cookFrame);
  $('kiosk').hidden = true;
  $('rest').classList.remove('pumping');
  paintRest();
  showRestStatus();
}
$('open-kiosk').addEventListener('click', openKiosk);
$('kiosk-close').addEventListener('click', () => { closeKiosk(); $('open-kiosk').focus(); });
$('menu-list').addEventListener('click', event => {
  const button = event.target.closest('[data-food]');
  if (!button || button.disabled) return;
  cart.push(button.dataset.food);
  beep(760, .05);
  paintKiosk();
  ($('menu-list').querySelector('button:not(:disabled)') || $('kiosk-pay')).focus();
});
$('cart-list').addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  cart = cart.filter(id => id !== button.dataset.remove);
  paintKiosk();
});
$('kiosk-pay').addEventListener('click', () => {
  if (!cart.length || cartTotal() > profile.balance) return;
  profile.balance -= cartTotal();
  save();
  $('balance').textContent = number(profile.balance);
  const orderNo = 100 + Math.floor(Math.random() * 900);
  $('kiosk-order').hidden = true;
  $('kiosk-close').hidden = true;
  $('kiosk-wait').hidden = false;
  $('kiosk-pickup').hidden = true;
  $('order-no').textContent = String(orderNo);
  $('order-state').textContent = '결제 완료 · 조리 중…';
  beep(880, .08);
  const start = performance.now(), cook = 2200 + cart.length * 700;
  const step = t => {
    const k = Math.min(1, (t - start) / cook);
    $('cook-bar').style.transform = `scaleX(${k})`;
    if (k < 1) { cookFrame = requestAnimationFrame(step); return; }
    $('order-state').textContent = `${orderNo}번 고객님, 주문하신 음식 나왔습니다!`;
    beep(990, .12);
    setTimeout(() => beep(1180, .12), 160);
    $('kiosk-pickup').hidden = false;
    $('kiosk-pickup').focus();
  };
  cookFrame = requestAnimationFrame(step);
});
$('kiosk-pickup').addEventListener('click', () => {
  const order = cart.slice();
  cart = [];
  closeKiosk();
  const done = [];
  const next = () => {
    const id = order.shift();
    if (!id) {
      restSay(!done.length ? '' : done.length > 2 ? `냠 — ${done[0]} 외 ${done.length - 1}개` : `냠 — ${done.join(' · ')}`);
      paintRest();
      paintHud();
      $('depart').focus();
      return;
    }
    const food = foods.find(item => item.id === id);
    if (eatFood(state, id)) {
      restEaten.add(id);
      done.push(food.name);
    }
    if (food.still) { beep(700, .1); next(); return; }
    playMovie(`eat-${id}`, `${food.name} 먹는 중…`, () => { beep(700, .1); next(); });
  };
  next();
});
addEventListener('keydown', event => {
  if ($('kiosk').hidden || event.code !== 'Escape' || $('kiosk-order').hidden) return;
  closeKiosk();
  $('open-kiosk').focus();
});
$('depart').addEventListener('click', departRest);
$('rest').addEventListener('cancel', event => event.preventDefault());
$('rest-go').addEventListener('click', askRest);

function syncMusic() {
  if (profile.music === 'random' && !shuffled) pickShuffle();
  const track = tracks.find(item => item.id === (profile.music === 'random' ? shuffled : profile.music));
  music.loop = profile.music !== 'random';
  const want = track && screen === 'drive' && !$('paused').open && soundEnabled();
  if (!want) { music.pause(); return; }
  const src = `${assetRoot}music/${track.id}.mp3?v=1`;
  if (!music.src.endsWith(src)) music.src = src;
  music.volume = profile.musicVolume;
  music.play().catch(() => {});
}
function paintMusic() {
  const random = profile.music === 'random';
  const track = tracks.find(item => item.id === (random ? shuffled : profile.music));
  $('music-now').textContent = track ? `♪ ${random ? '무작위 · ' : ''}${track.name}` : '음악 꺼짐';
  $('music-list').innerHTML = [{ id: 'random', name: '무작위(곡이 끝나면 다른 곡)' }, ...tracks, { id: '', name: '끄기' }].map(item =>
    `<button type="button" class="${item.id === profile.music ? 'on' : ''}" data-track="${item.id}">${item.name}</button>`).join('');
  $('music-volume').value = String(profile.musicVolume);
}
// N 키로 음악 끄기 · 켜기(운영자 요청) — 켜면 전에 듣던 설정(무작위 또는 고른 곡)으로
function toggleMusicMute() {
  if (profile.music) { profile.lastMusic = profile.music; profile.music = ''; }
  else profile.music = profile.lastMusic || 'random';
  if (profile.music === 'random') pickShuffle();
  save();
  syncMusic();
  paintMusic();
  $('music').classList.toggle('off', !profile.music);
}
function toggleMusicMenu(open = $('music-menu').hidden) {
  $('music-menu').hidden = !open;
  $('music').setAttribute('aria-expanded', String(open));
  if (open) paintMusic();
}
$('music').addEventListener('click', () => toggleMusicMenu());
$('music-list').addEventListener('click', event => {
  const button = event.target.closest('[data-track]');
  if (!button) return;
  profile.music = button.dataset.track;
  profile.musicPicked = true;
  if (profile.music) profile.lastMusic = profile.music;
  $('music').classList.toggle('off', !profile.music);
  if (profile.music === 'random') pickShuffle();
  save();
  paintMusic();
  syncMusic();
});
$('music-volume').addEventListener('input', event => {
  profile.musicVolume = Number(event.target.value);
  music.volume = profile.musicVolume;
  save();
});

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
    if (countdown <= 0) runStarted = true;
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
  $('rest').classList.remove('watching');
  $('refuel-movie').hidden = true;
  refuelVideo.pause();
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
  // 판 시작은 카운트다운 전에 알린다 — 아케이드가 이 신호로 순위 패널을 닫는다(전에는 3·2·1 동안 열려 있었음)
  send('hk:start');
  syncCursor();
  if (profile.music === 'random') pickShuffle();
  syncMusic();
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
  syncCursor();
  syncMusic();
  toggleMusicMenu(false);
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
  syncMusic();
  toggleMusicMenu(false);
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
  syncCursor();
  syncMusic();
  send('hk:paused');
}
function resume() {
  if (!$('paused').open) return;
  $('paused').close();
  previous = 0;
  wakeAudio();
  stage.focus();
  send('hk:resumed');
  syncMusic();
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

// 휴대폰에서 출발하려 하면 PC 권장 안내(운영자 요청) — 손가락 화면이면서 긴 쪽이 1100px 보다 작으면, 「그래도 할게요」 뒤엔 창을 닫을 때까지 안 물음
const phoneLike = () => matchMedia('(pointer: coarse)').matches && Math.max(innerWidth, innerHeight) < 1100;
let mobileOk = false;
try { mobileOk = sessionStorage.getItem('twilightrun-mobile-ok') === '1'; } catch { mobileOk = false; }
$('start').addEventListener('click', () => {
  if (phoneLike() && !mobileOk) { $('mobile-note').showModal(); $('mobile-go').focus(); return; }
  start();
});
$('mobile-go').addEventListener('click', () => {
  mobileOk = true;
  try { sessionStorage.setItem('twilightrun-mobile-ok', '1'); } catch { /* 저장 못 해도 이번 창에선 기억 */ }
  $('mobile-note').close();
  start();
});
$('mobile-close').addEventListener('click', () => { $('mobile-note').close(); $('start').focus(); });
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
  else if (!event.repeat && event.code === 'KeyM') toggleMusicMenu();
  else if (!event.repeat && event.code === 'KeyN') toggleMusicMute();
  else if (!event.repeat && event.code === 'KeyE') askRest();
});
addEventListener('keyup', event => keys.delete(event.code));
// 주행 중에는 마우스 포인터를 숨긴다 — 움직이면 1.5초 보였다가 다시 숨김, 멈춤 · 휴게소 · 결과 창에서는 늘 보임(운영자 요청)
let cursorTimer = 0;
function syncCursor() {
  const driving = screen === 'drive' && !$('paused').open && !$('rest').open && !$('results').open;
  document.body.classList.toggle('hide-cursor', driving);
}
addEventListener('mousemove', () => {
  document.body.classList.remove('hide-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(syncCursor, 1500);
});
for (const id of ['paused', 'rest', 'results']) $(id).addEventListener('close', () => setTimeout(syncCursor, 1500));
// 게임 화면 어디든 누르면 아케이드의 오른쪽 순위 패널을 닫게 알린다(창 안을 누른 건 바깥에서 모른다)
addEventListener('pointerdown', () => send('hk:tap'), true);
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
  syncMusic();
  if (arcadeMuted) quietEngine();
  else if (screen === 'drive' && !$('paused').open) wakeAudio();
});

$('camera').setAttribute('aria-label', `시점 변경 · 현재 ${viewNames[view]}`);
paintCarSelection();
homeInfo();
send('hk:ready');
