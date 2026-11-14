import type { Vec3 } from './math.ts';
import { rng } from './math.ts';
import { FLOOR_BOUNDS, MAIN_TAGS } from './scene.ts';

/**
 * 3D 空間に貼り付く HTML ラベル 1 枚分。
 * 表示方式（overlay / canvas）に依存しない状態だけを持つ。方式ごとの状態は各 strategy が自前で持つ。
 */
export interface Label {
  id: string;
  kind: 'main' | 'pin';
  el: HTMLElement;
  anchor: Vec3;
  /** レイアウト上のサイズ（CSS px）。毎フレーム offsetWidth を読まないようキャッシュ */
  w: number;
  h: number;
  /** 直近フレームの画面上の矩形（CSS px, canvas 左上基準）。projection.ts が毎フレーム更新する */
  screen: ScreenRect;
}

export interface ScreenRect {
  left: number;
  top: number;
  /** ラベルの CSS サイズに対する画面上の拡大率（遠いと小さい） */
  scale: number;
  visible: boolean;
  /** 壁など遮蔽物の裏にあるか（CPU のレイキャスト） */
  occluded: boolean;
  /** カメラからの距離（ソート用） */
  depth: number;
}

export type LogFn = (msg: string) => void;

const newScreen = (): ScreenRect => ({ left: 0, top: 0, scale: 1, visible: false, occluded: false, depth: 0 });

export function measure(l: Label): void {
  l.w = l.el.offsetWidth;
  l.h = l.el.offsetHeight;
}

function mainTagEl(def: (typeof MAIN_TAGS)[number], log: LogFn): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tag main';
  el.id = `tag-${def.id}`;
  // drawable: canvas 方式のとき「この要素は描画対象」の印。overlay 方式では何もしない
  el.setAttribute('drawable', '');
  el.innerHTML = `
    <div class="name">${def.name}</div>
    <div class="value">${def.value}</div>
    <div class="row">
      <button type="button" data-action="detail">詳細 <span class="clicks">0</span></button>
      ${def.note ? '<input class="memo" type="text" placeholder="メモ" aria-label="メモ" />' : ''}
    </div>`;
  const btn = el.querySelector('button')!;
  const clicks = el.querySelector('.clicks')!;
  let n = 0;
  btn.addEventListener('click', () => {
    clicks.textContent = String(++n);
    log(`click  ${def.name} 「詳細」(${n}回目)`);
  });
  el.addEventListener('pointerenter', () => log(`hover  ${def.name}`));
  el.querySelector('input')?.addEventListener('input', (e) => log(`input  ${def.name} メモ="${(e.target as HTMLInputElement).value}"`));
  return el;
}

function pinEl(i: number, log: LogFn, rand: () => number): HTMLElement {
  const sev = rand() < 0.2 ? 'high' : rand() < 0.5 ? 'mid' : 'low';
  const el = document.createElement('div');
  el.className = `tag pin ${sev}`;
  el.id = `tag-pin${i}`;
  el.setAttribute('drawable', '');
  el.innerHTML = `<span class="dot"></span><span class="pin-name">#${String(i + 1).padStart(3, '0')}</span><span class="pin-val">${(20 + rand() * 8).toFixed(1)}℃</span>`;
  el.addEventListener('click', () => log(`click  ピン #${i + 1}`));
  return el;
}

export function createMainLabels(log: LogFn): Label[] {
  return MAIN_TAGS.map((def) => ({
    id: def.id,
    kind: 'main',
    el: mainTagEl(def, log),
    anchor: def.anchor,
    w: 0,
    h: 0,
    screen: newScreen(),
  }));
}

export function createPins(count: number, log: LogFn): Label[] {
  const rand = rng(42);
  const [x0, x1] = FLOOR_BOUNDS.x;
  const [z0, z1] = FLOOR_BOUNDS.z;
  const pins: Label[] = [];
  for (let i = 0; i < count; i++) {
    const anchor: Vec3 = [x0 + rand() * (x1 - x0), 0.4 + rand() * 2.2, z0 + rand() * (z1 - z0)];
    pins.push({ id: `pin${i}`, kind: 'pin', el: pinEl(i, log, rand), anchor, w: 0, h: 0, screen: newScreen() });
  }
  return pins;
}
