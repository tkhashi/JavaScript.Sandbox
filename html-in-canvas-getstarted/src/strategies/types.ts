import type { CameraFrame } from '../shared/camera.ts';
import type { Label } from '../shared/labels.ts';

/** 1 フレーム分の描画処理。changed は canvas の paint イベントで変化した要素（overlay では null） */
export type RenderFn = (changed: ReadonlySet<Element> | null) => void;

/**
 * 「3D 空間に貼り付く HTML ラベルをどう表示するか」の方式。
 * 方式ごとの差分はすべてこのインターフェースの実装（strategies/overlay, strategies/canvas）に閉じ込めている。
 * 共通部分（シーン描画・3D→画面座標の計算・UI）は shared/ と demo/ にあり、方式を知らない。
 */
export interface LabelStrategy {
  readonly id: 'overlay' | 'canvas';
  readonly title: string;

  /** ラベル要素をこの方式が使う場所へ移し、方式固有の状態を初期化する */
  attach(label: Label): void;

  /** この方式を有効にする。render は「1 フレーム分の描画」 */
  activate(render: RenderFn): void;
  deactivate(): void;

  /** 毎 requestAnimationFrame に呼ばれる。描画をいつ走らせるかは方式次第 */
  requestFrame(): void;

  /**
   * シーン描画の直後に呼ばれ、ラベルを画面に反映する。
   * labels は奥→手前の順。各 label.screen に画面上の矩形が入っている。
   */
  update(camera: CameraFrame, labels: Label[], changed: ReadonlySet<Element> | null): void;
}
