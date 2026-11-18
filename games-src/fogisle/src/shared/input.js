// 주는 것: 입력 표(makeInput — sim 한 단계에 한 장) · quantAngle(시점 각 눈금 맞춤).
// 받는 것: tune/sim. 표를 채우는 쪽은 app(장치) · bot(시험) 이고 sim 은 읽기만 한다(tdd §2-4).
// mx · mz = 이동 축(−1 ~ 1) / yaw · pitch = 절대 시점 각(눈금에 맞춘 rad) / held = 눌린 단추 비트 / edge = 이번 단계에 눌린 가장자리 비트 / wheel = 휠 칸 수.
import { SIM } from './tune/sim.js';

export function makeInput() { return { mx: 0, mz: 0, yaw: 0, pitch: 0, held: 0, edge: 0, wheel: 0 }; }

export function quantAngle(a) { return Math.round(a * SIM.angleSteps) / SIM.angleSteps; }
