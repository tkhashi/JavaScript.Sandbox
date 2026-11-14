import { FLOOR_BOUNDS, MAIN_TAGS, rng, type Vec3 } from './scene-data.ts';

// 3D 空間に貼り付く HTML ラベル 1 枚分の DOM と状態。
// DOM 生成部分は原典 html-in-canvas-getstarted/src/shared/labels.ts を土台に、この試作用に最小化したもの。

export type LogFn = (msg: string) => void;

export interface Label {
  id: string;
  kind: 'main' | 'pin';
  el: HTMLElement;
  /** ビルボードの下端中央が来る 3D 位置 */
  anchor: Vec3;
  /** レイアウト上のサイズ（CSS px）。canvas の子としてレイアウトされた後に測る */
  w: number;
  h: number;
}

function mainTagEl(def: (typeof MAIN_TAGS)[number], log: LogFn): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tag main';
  el.id = `tag-${def.id}`;
  // drawable: 「この要素は HTML-in-Canvas の描画対象」の印
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
  el.innerHTML = `<span class="dot"></span><span class="pin-name">#${String(i + 1).padStart(2, '0')}</span><span class="pin-val">${(20 + rand() * 8).toFixed(1)}℃</span>`;
  el.addEventListener('click', () => log(`click  ピン #${i + 1}`));
  return el;
}

export function createMainLabels(log: LogFn): Label[] {
  return MAIN_TAGS.map((def) => ({ id: def.id, kind: 'main' as const, el: mainTagEl(def, log), anchor: def.anchor, w: 0, h: 0 }));
}

export function createPins(count: number, log: LogFn): Label[] {
  const rand = rng(42);
  const [x0, x1] = FLOOR_BOUNDS.x;
  const [z0, z1] = FLOOR_BOUNDS.z;
  const pins: Label[] = [];
  for (let i = 0; i < count; i++) {
    const anchor: Vec3 = [x0 + rand() * (x1 - x0), 0.4 + rand() * 2.2, z0 + rand() * (z1 - z0)];
    pins.push({ id: `pin${i}`, kind: 'pin', el: pinEl(i, log, rand), anchor, w: 0, h: 0 });
  }
  return pins;
}
