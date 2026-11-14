import { OrbitCamera } from '../shared/camera.ts';
import { createMainLabels, createPins, measure, type Label, type LogFn } from '../shared/labels.ts';
import { projectLabels } from '../shared/projection.ts';
import { SceneRenderer } from '../shared/scene-renderer.ts';
import { CanvasStrategy } from '../strategies/canvas/canvas.ts';
import { OverlayStrategy } from '../strategies/overlay/overlay.ts';
import type { LabelStrategy } from '../strategies/types.ts';

export type Mode = 'overlay' | 'canvas';

export interface Stats {
  fps: number;
  /** 3D→画面座標の計算 + ラベル反映（strategy.update）にかかった JS 時間 (ms, 移動平均) */
  syncMs: number;
  /** 壁の裏にあるラベル数 */
  occluded: number;
}

export interface App {
  readonly canvas: HTMLCanvasElement;
  readonly camera: OrbitCamera;
  readonly stats: Stats;
  readonly mode: Mode;
  readonly strategy: LabelStrategy;
  onModeChange: ((strategy: LabelStrategy) => void) | null;
  labels(): Label[];
  setMode(mode: Mode): void;
  rebuildPins(count: number): void;
  /** 次のフレーム描画の直後に canvas.toBlob() する */
  capture(): Promise<Blob | null>;
  nextFrames(n: number): Promise<void>;
}

export interface AppOptions {
  canvas: HTMLCanvasElement;
  /** overlay 方式のラベルを置く、canvas の上に重ねた要素 */
  overlayRoot: HTMLElement;
  log: LogFn;
}

/**
 * 共通部分（シーン・カメラ・フレームループ・撮影）を組み立てる。
 * ラベルをどう表示するかは strategy に任せ、ここでは方式の違いを意識しない。
 */
export function createApp({ canvas, overlayRoot, log }: AppOptions): App {
  const scene = new SceneRenderer(canvas);
  const camera = new OrbitCamera();
  camera.bind(canvas);

  const strategies: Record<Mode, LabelStrategy> = {
    overlay: new OverlayStrategy(overlayRoot),
    canvas: new CanvasStrategy(canvas, scene.gl),
  };

  const main = createMainLabels(log);
  let pins: Label[] = [];
  const allLabels = (): Label[] => [...main, ...pins];
  const stats: Stats = { fps: 0, syncMs: 0, occluded: 0 };

  let mode: Mode = 'canvas';
  let strategy = strategies[mode];
  let pendingCapture: ((b: Blob | null) => void) | null = null;

  // ---------- 1 フレーム分の描画（どの方式でも同じ流れ） ----------
  function renderFrame(changed: ReadonlySet<Element> | null): void {
    const cam = camera.frame(canvas.clientWidth, canvas.clientHeight);

    const t0 = performance.now();
    const { sorted, occluded } = projectLabels(allLabels(), cam); // 共通: 3D → 画面座標
    const tProject = performance.now() - t0;
    stats.occluded = occluded;

    scene.draw(cam.vp); // 共通: 床・壁

    const t1 = performance.now();
    strategy.update(cam, sorted, changed); // ★ 方式ごとの差分はここだけ
    const total = tProject + performance.now() - t1;
    stats.syncMs = stats.syncMs === 0 ? total : stats.syncMs * 0.9 + total * 0.1;

    if (pendingCapture) {
      const resolve = pendingCapture;
      pendingCapture = null;
      canvas.toBlob((b) => resolve(b), 'image/png');
    }
  }

  // ---------- モード切替 ----------
  function attachAll(): void {
    for (const l of allLabels()) {
      strategy.attach(l);
      measure(l);
    }
  }

  const app: App = {
    canvas,
    camera,
    stats,
    get mode() {
      return mode;
    },
    get strategy() {
      return strategy;
    },
    onModeChange: null,
    labels: allLabels,
    setMode(next) {
      strategy.deactivate();
      mode = next;
      strategy = strategies[next];
      strategy.activate(renderFrame);
      attachAll();
      app.onModeChange?.(strategy);
    },
    rebuildPins(count) {
      for (const l of pins) l.el.remove();
      pins = createPins(count, log);
      scene.setStems(pins.map((p) => p.anchor));
      for (const l of pins) {
        strategy.attach(l);
        measure(l);
      }
    },
    capture: () => new Promise((resolve) => (pendingCapture = resolve)),
    nextFrames: (n) =>
      new Promise((resolve) => {
        const step = (left: number): void => {
          if (left <= 0) resolve();
          else requestAnimationFrame(() => step(left - 1));
        };
        step(n);
      }),
  };

  // ---------- リサイズ ----------
  new ResizeObserver((entries) => {
    const box = entries[0]?.devicePixelContentBoxSize?.[0];
    const dpr = window.devicePixelRatio || 1;
    const w = box ? box.inlineSize : Math.round(canvas.clientWidth * dpr);
    const h = box ? box.blockSize : Math.round(canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;
    scene.resize(w, h);
  }).observe(canvas, { box: 'device-pixel-content-box' });

  // ---------- フレームループ ----------
  let last = performance.now();
  const tick = (now: number): void => {
    requestAnimationFrame(tick);
    const dt = now - last;
    last = now;
    stats.fps = stats.fps === 0 ? 1000 / dt : stats.fps * 0.9 + (1000 / dt) * 0.1;
    strategy.requestFrame();
  };

  strategy.activate(renderFrame);
  attachAll();
  app.rebuildPins(0);
  requestAnimationFrame(tick);
  return app;
}
