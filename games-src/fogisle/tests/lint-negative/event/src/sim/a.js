// 주는 것: lint 음성 시험 판 — 이 폴더 이름 앞머리의 규칙 하나만 걸려야 한다. / 받는 것: 없음
import { EV } from '../shared/events.js';
export function kind() { return EV.hit + EV.shot; }
