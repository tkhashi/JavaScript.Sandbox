import type { Aabb, Vec3 } from './math.ts';

/** シーン定義: 隣り合う2部屋と、その間の壁（出入口つき） */
export interface Box extends Aabb {
  color: Vec3;
  /** タグの遮蔽判定（CPU レイキャスト）に使うか */
  occluder: boolean;
}

const WALL_COLOR: Vec3 = [0.82, 0.84, 0.88];

export const BOXES: Box[] = [
  // 床: 部屋A(+x) は青系、部屋B(-x) は緑系
  { min: [0.1, -0.1, -4], max: [6, 0, 4], color: [0.78, 0.86, 0.95], occluder: false },
  { min: [-6, -0.1, -4], max: [-0.1, 0, 4], color: [0.8, 0.92, 0.82], occluder: false },
  // 仕切り壁（z=-0.8..0.8 が出入口）
  { min: [-0.1, 0, -4], max: [0.1, 3, -0.8], color: WALL_COLOR, occluder: true },
  { min: [-0.1, 0, 0.8], max: [0.1, 3, 4], color: WALL_COLOR, occluder: true },
  // 機器（見た目のみ）
  { min: [3.1, 0, -3], max: [4.1, 1.2, -2.2], color: [0.55, 0.62, 0.72], occluder: false },
  { min: [-3.6, 0, 1.8], max: [-2.8, 0.5, 2.6], color: [0.62, 0.7, 0.6], occluder: false },
];

export const OCCLUDERS: Aabb[] = BOXES.filter((b) => b.occluder);

export interface MainTagDef {
  id: string;
  name: string;
  value: string;
  anchor: Vec3;
  note?: boolean;
}

export const MAIN_TAGS: MainTagDef[] = [
  { id: 'roomA', name: '会議室A', value: '24.1 ℃ / CO₂ 612 ppm', anchor: [3, 2.2, 0.5] },
  { id: 'ahu01', name: 'AHU-01', value: '給気 18.2 ℃', anchor: [3.6, 1.35, -2.6] },
  { id: 'roomB', name: '執務室B', value: '25.8 ℃ / CO₂ 804 ppm', anchor: [-3, 2.2, 0.5] },
  { id: 'fcu12', name: 'FCU-12', value: '冷房 / 風量 中', anchor: [-3.2, 0.65, 2.2], note: true },
];

export const FLOOR_BOUNDS = { x: [-5.6, 5.6], z: [-3.6, 3.6] } as const;
