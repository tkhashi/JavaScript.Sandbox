import type { LogFn } from '../shared/labels.ts';
import type { App, Mode } from './app.ts';
import { runSelfTests } from './selftest.ts';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`not found: ${sel}`);
  return el;
};

/** イベントログ。どの方式のときの出来事か分かるよう方式名を付ける */
export function createLogger(list: HTMLOListElement, getMode: () => Mode): LogFn {
  return (msg) => {
    const li = document.createElement('li');
    li.textContent = `[${getMode()}] ${msg}`;
    list.prepend(li);
    while (list.children.length > 40) list.lastElementChild?.remove();
  };
}

/** サイドパネル（方式切替・ピン数・撮影・自動テスト・計測表示）を app に結びつける */
export function bindPanel(app: App): void {
  // ---- 方式切替 ----
  document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => r.addEventListener('change', () => r.checked && app.setMode(r.value as Mode)));
  app.onModeChange = (strategy) => {
    document.querySelector<HTMLInputElement>(`input[name=mode][value=${strategy.id}]`)!.checked = true;
    $('#badge').textContent = strategy.title;
  };
  app.onModeChange(app.strategy);

  // ---- ピン数 ----
  const pins = $<HTMLInputElement>('#pins');
  pins.addEventListener('input', () => {
    $('#pinsOut').textContent = pins.value;
    app.rebuildPins(Number(pins.value));
  });
  app.rebuildPins(Number(pins.value));

  // ---- 撮影（canvas.toBlob） ----
  const shotUrls: Partial<Record<Mode, string>> = {};
  const takeShot = async (): Promise<void> => {
    const mode = app.mode;
    const blob = await app.capture();
    if (!blob) return;
    const prev = shotUrls[mode];
    if (prev) URL.revokeObjectURL(prev);
    shotUrls[mode] = URL.createObjectURL(blob);
    $<HTMLImageElement>(mode === 'canvas' ? '#shotCanvas' : '#shotOverlay').src = shotUrls[mode]!;
  };
  $('#shot').addEventListener('click', () => void takeShot());
  $('#shotBoth').addEventListener('click', async () => {
    const prev = app.mode;
    for (const m of ['overlay', 'canvas'] as const) {
      app.setMode(m);
      await app.nextFrames(4);
      await takeShot();
    }
    app.setMode(prev);
  });

  $('#resetView').addEventListener('click', () => app.camera.reset());

  // ---- 自動テスト ----
  $('#runTests').addEventListener('click', async () => {
    const out = $('#testOut');
    out.innerHTML = '<li>実行中...</li>';
    const results = await runSelfTests(app);
    out.innerHTML = '';
    for (const r of results) {
      const li = document.createElement('li');
      const tag = document.createElement('span');
      tag.className = r.status === 'PASS' ? 'pass' : r.status === 'FAIL' ? 'fail' : 'ref';
      tag.textContent = r.status;
      const detail = document.createElement('div');
      detail.style.color = 'var(--muted)';
      detail.textContent = r.detail;
      li.append(tag, ` ${r.name}`, detail);
      out.append(li);
    }
  });

  // ---- 計測表示 ----
  setInterval(() => {
    const labels = app.labels();
    $('#stFps').textContent = app.stats.fps.toFixed(0);
    $('#stSync').textContent = `${app.stats.syncMs.toFixed(2)} ms`;
    $('#stCount').textContent = `${labels.length}（${labels.filter((l) => l.kind === 'pin').length}）`;
    $('#stOcc').textContent = `${app.stats.occluded} 件`;
  }, 400);
}
