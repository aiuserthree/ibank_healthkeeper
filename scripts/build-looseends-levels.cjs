/* node scripts/build-looseends-levels.cjs — 실타래 풀기 본편 40판을 만들어 levels.js 로 굳힌다.
 * 같은 씨앗이면 같은 판이 나온다(결정적). 판마다 풀이기로 최소 수를 구해 목표(target)로 쓴다. */
const fs = require('node:fs');
const path = require('node:path');
const R = require('../web/games/embed/looseends/rules.js');
const { fork } = require('node:child_process');

const NAMES = ['첫 번째 실', '하나씩 차례로', '위에 얹힌 줄', '길 터 주기', '엇갈린 세 줄', '빈 구멍 찾기', '돌아가는 길', '실뭉치 조금',
  '느슨한 매듭', '두 번 옮기기', '엮인 고리', '차근차근', '실꾸러미', '숨은 순서', '안쪽 구멍', '가운데 길', '얽힌 수놓기', '바늘 끝에서',
  '꼬마 매듭', '풀어헤치기', '긴 한 줄', '촘촘한 올', '뒤엉킨 오후', '맨 아래 줄', '미로 같은 바느질', '겹겹이', '한 올 한 올', '실 잣는 밤',
  '큰 매듭', '뒤집어 보기', '끝없는 고리', '조용한 정리', '마지막 올 찾기', '얼기설기', '실패 속 비밀', '고요한 수틀', '엉킨 소원', '긴 밤의 실',
  '마지막 매듭', '풀린 실타래'];

// 단계별 설계: [구멍 바깥 고리, 안쪽 고리, 줄 수, 최소 수, 최대 수]
function spec(i) {
  if (i === 1) return [8, 0, 3, 1, 1];
  if (i === 2) return [8, 0, 3, 2, 2];
  if (i === 3) return [8, 0, 3, 2, 3];
  if (i <= 9) return [10, 0, 4, i < 7 ? 2 : 3, i < 7 ? 3 : 4];
  if (i <= 12) return [12, 0, 5, 3, 5];
  if (i <= 18) return [12, i > 14 ? 4 : 0, 5 + (i > 15 ? 1 : 0), 4, 6];
  if (i <= 26) return [12, 4, 6 + (i > 22 ? 1 : 0), 5, 7];
  if (i <= 34) return [14, 4, 7, 6, 8];
  return [14, 6, 8, 7, 9];
}


function build(i, relax = 0) {
  const [ring, inner, ropes, min0, max0] = spec(i);
  const minMoves = Math.max(1, min0 - relax), maxMoves = max0 + relax;
  for (let attempt = 0; attempt < 12; attempt++) {
    const p = R.generate(i * 101 + attempt * 7, { ring, inner, ropes, minMoves: minMoves - (attempt > 6 ? 1 : 0), maxMoves: maxMoves + (attempt > 8 ? 1 : 0), tries: 600, nodes: 160000 });
    if (p) return { n: i, name: NAMES[i - 1], ring, inner, target: p.target, ropes: p.ropes.map(r => [r.a, r.b]) };
  }
  throw new Error('level ' + i + ' failed');
}

// 단계마다 따로 계산하므로 여러 프로세스로 나눠 돌린다(결과는 순서와 상관없이 같다).
if (process.argv[2] === 'one') {
  process.send(build(+process.argv[3], +process.argv[4] || 0));
} else {
  const done = [], t0 = Date.now(), POOL = 8;
  let next = 1, running = 0;
  const launch = () => {
    while (running < POOL && next <= 40) {
      run(next++, 0);
    }
  };
  // 한 단계가 너무 오래 걸리면(240초) 조건을 한 칸 풀어 다시 시도한다
  const run = (i, relax) => {
    running++;
    const c = fork(__filename, ['one', String(i), String(relax)]);
    let ok = false;
    const timer = setTimeout(() => { process.stdout.write(`(${i} 느려서 조건 완화) `); c.kill(); }, 240000);
    c.on('message', m => { ok = true; done[m.n - 1] = m; process.stdout.write(`${m.n}:${m.target} `); });
    c.on('exit', () => {
      clearTimeout(timer); running--;
      if (!ok) { if (relax >= 3) { console.error('level', i, 'failed'); process.exit(1); } run(i, relax + 1); return; }
      if (next > 40 && !running) finish(); else launch();
    });
  };
  const finish = () => {
    console.log('\nms', Date.now() - t0);
    const file = path.join(__dirname, '../web/games/embed/looseends/levels.js');
    fs.writeFileSync(file, '/* 자동 생성 — node scripts/build-looseends-levels.cjs . 줄은 아래(먼저) → 위(나중) 순서의 [끝A, 끝B] 구멍 번호. */\n' + '(typeof window !== "undefined" ? window : globalThis).LooseLevels = ' + JSON.stringify(done) + ';\nif (typeof module === "object" && module.exports) module.exports = (typeof window !== "undefined" ? window : globalThis).LooseLevels;\n');
    console.log('wrote', file);
  };
  launch();
}
