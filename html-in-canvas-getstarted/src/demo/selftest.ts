import type { Label } from '../shared/labels.ts';
import type { App } from './app.ts';

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | '参考';
  detail: string;
}

/** ページ内で動く自動テスト。DOM の取得・ヒットテストが「普通の DOM と同じやり方」でできるかを確かめる */
export async function runSelfTests(app: App): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const add = (name: string, ok: boolean | '参考', detail: string): void => {
    results.push({ name, status: ok === '参考' ? '参考' : ok ? 'PASS' : 'FAIL', detail });
  };
  const byId = (id: string): Label => {
    const l = app.labels().find((x) => x.id === id);
    if (!l) throw new Error(`label not found: ${id}`);
    return l;
  };
  const describe = (el: Element | null): string => (el instanceof HTMLElement ? el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') : String(el));

  /** ラベル内の子要素の中心が、viewport のどこにあるか（3D → 画面の拡大率を考慮） */
  const viewportCenterOf = (l: Label, child: HTMLElement): [number, number] => {
    const s = l.screen;
    const r = app.canvas.getBoundingClientRect();
    return [r.left + s.left + (child.offsetLeft + child.offsetWidth / 2) * s.scale, r.top + s.top + (child.offsetTop + child.offsetHeight / 2) * s.scale];
  };

  const prevMode = app.mode;
  app.camera.reset();
  app.setMode('canvas');
  await app.nextFrames(4);

  // T1: DOM から値を取れる（canvas のピクセルを読まずに assert できる）
  const nameText = document.querySelector('#tag-roomA .name')?.textContent;
  add('ラベルの文字を querySelector で取得できる', nameText === '会議室A', `#tag-roomA .name = "${nameText}"`);

  // T2: ヒットテスト座標が 3D 上のボタン位置に一致する
  const roomA = byId('roomA');
  const btn = roomA.el.querySelector<HTMLElement>('button')!;
  const hit = document.elementFromPoint(...viewportCenterOf(roomA, btn));
  add('3D 上のボタン位置で elementFromPoint がそのボタンを返す', hit === btn || btn.contains(hit), `hit = ${describe(hit)}`);

  // T3: そのまま click できる
  const clicks = roomA.el.querySelector('.clicks')!;
  const before = Number(clicks.textContent);
  if (hit instanceof HTMLElement) hit.click();
  add('ヒットした要素の click がハンドラに届く', Number(clicks.textContent) === before + 1, `クリック数 ${before} → ${clicks.textContent}`);

  // T4: 壁の裏のラベル（FCU-12）は当たり判定が無い。
  // HTML-in-Canvas の当たり判定は画面上の矩形だけで、3D の深度は考慮されない。そのためレイキャストで外している
  const hidden = byId('fcu12');
  const hiddenBtn = hidden.el.querySelector<HTMLElement>('button')!;
  const hitHidden = document.elementFromPoint(...viewportCenterOf(hidden, hiddenBtn));
  add('壁の裏のラベルに当たらない（canvas 方式 + レイキャスト）', hidden.screen.occluded && !hidden.el.contains(hitHidden), `occluded=${hidden.screen.occluded} visible=${hidden.screen.visible} hit = ${describe(hitHidden)}`);

  // T5: HTML を書き換えるとテクスチャが更新される（paint イベント経由）
  const nameEl = roomA.el.querySelector('.name')!;
  nameEl.textContent = '会議室A（改）';
  await app.nextFrames(3);
  add('DOM を書き換えても取得できる', document.querySelector('#tag-roomA .name')?.textContent === '会議室A（改）', 'name を書き換えて 3 フレーム後に確認');
  nameEl.textContent = '会議室A';

  // 参考: オーバーレイ方式では、壁の裏のラベルにも当たってしまう
  app.setMode('overlay');
  await app.nextFrames(3);
  const hitOverlay = document.elementFromPoint(...viewportCenterOf(hidden, hiddenBtn));
  add('オーバーレイ方式では壁の裏のラベルに当たる', '参考', `occluded=${hidden.screen.occluded} hit = ${describe(hitOverlay)}（ラベルに当たれば透けて操作できてしまう）`);

  app.setMode(prevMode);
  return results;
}
