import type { App } from './app.ts';

/** ラベルの HTML を 1 秒ごとに書き換える（DOM が変わると canvas 方式では paint イベント → テクスチャ再転送が走る） */
export function startLiveValues(app: App): void {
  setInterval(() => {
    for (const l of app.labels()) {
      if (l.kind !== 'main' || l.id === 'fcu12') continue;
      const v = l.el.querySelector('.value');
      if (!v) continue;
      const base = l.id === 'ahu01' ? 18.2 : l.id === 'roomA' ? 24.1 : 25.8;
      const t = (base + (Math.random() - 0.5) * 0.6).toFixed(1);
      v.textContent = l.id === 'ahu01' ? `給気 ${t} ℃` : `${t} ℃ / CO₂ ${Math.round(600 + Math.random() * 250)} ppm`;
    }
  }, 1000);
}
