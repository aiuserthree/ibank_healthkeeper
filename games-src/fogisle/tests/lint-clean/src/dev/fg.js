// 주는 것: lint 양성 대조 — dev 는 어느 층이든 import 한다. / 받는 것: app · shared
import { boot } from '../app/main.js';
import { order } from '../shared/a.js';
globalThis.__fg = { v: 0, boot, order };
