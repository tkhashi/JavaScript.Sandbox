import type { Mat4, Vec3 } from './math.ts';
import { lookAt, mul, perspective } from './math.ts';

export const TARGET: Vec3 = [0, 1, 0];
const DEFAULT_VIEW = { yaw: 1.15, pitch: 0.45, radius: 12.5 };

/** 1 フレーム分のカメラ情報 */
export interface CameraFrame {
  eye: Vec3;
  /** projection * view */
  vp: Mat4;
  /** カメラの右・上ベクトル（ビルボード用） */
  right: Vec3;
  up: Vec3;
  /** canvas の CSS サイズ */
  cssW: number;
  cssH: number;
}

/** ドラッグで回転、ホイールでズームするだけの簡易オービットカメラ */
export class OrbitCamera {
  yaw = DEFAULT_VIEW.yaw;
  pitch = DEFAULT_VIEW.pitch;
  radius = DEFAULT_VIEW.radius;

  reset(): void {
    Object.assign(this, DEFAULT_VIEW);
  }

  set(v: Partial<typeof DEFAULT_VIEW>): void {
    Object.assign(this, v);
  }

  eye(): Vec3 {
    const cp = Math.cos(this.pitch);
    return [
      TARGET[0] + this.radius * cp * Math.sin(this.yaw),
      TARGET[1] + this.radius * Math.sin(this.pitch),
      TARGET[2] + this.radius * cp * Math.cos(this.yaw),
    ];
  }

  frame(cssW: number, cssH: number): CameraFrame {
    const eye = this.eye();
    const view = lookAt(eye, TARGET, [0, 1, 0]);
    const vp = mul(perspective(Math.PI / 4, cssW / cssH, 0.5, 80), view);
    return { eye, vp, right: [view[0]!, view[4]!, view[8]!], up: [view[1]!, view[5]!, view[9]!], cssW, cssH };
  }

  /** canvas へ操作を結びつける */
  bind(canvas: HTMLCanvasElement): void {
    let drag: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas) return; // ラベル上の操作はラベル側で処理
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.006;
      this.pitch = Math.min(1.4, Math.max(0.08, this.pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
    });
    const end = (): void => {
      drag = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.radius = Math.min(25, Math.max(4, this.radius * Math.exp(e.deltaY * 0.001)));
      },
      { passive: false },
    );
  }
}
