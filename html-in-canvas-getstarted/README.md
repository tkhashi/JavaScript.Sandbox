# HTML-in-Canvas 検証デモ

3D 空間に貼り付く文字（室名タグ・機器タグ・ピン）を、**HTML オーバーレイ**と **HTML-in-Canvas** の2方式で実装して比べる。
動作確認は Chrome 157（フラグ不要）。three.js は使わず、素の WebGL2 で書いている。

```
pnpm dev      # http://localhost:5173 （使用中なら vite が別ポートを選ぶ）
pnpm verify   # 実ブラウザで E2E。dev サーバー起動中に実行: node scripts/verify.ts [URL] [出力先]
pnpm loc      # 方式ごとの実装量（コード行数）
```

## 方式の違いを読むには

方式ごとの差分は `LabelStrategy`（`src/strategies/types.ts`）の実装に閉じ込めてある。
**この2ディレクトリを並べて読めば違いが分かる。**

| | overlay | canvas |
|---|---|---|
| 場所 | `src/strategies/overlay/overlay.ts` | `src/strategies/canvas/canvas.ts`, `billboard.ts` |
| 実装量 | 約 30 行 | 約 160 行（`pnpm loc`） |
| ラベルの置き場 | canvas の上に重ねた `<div>` | canvas の直接の子（`content="drawable"`） |
| 描画 | 毎フレーム `style.transform` を書く | `paint` イベント内で `texElementSubImage2D` → ビルボードに貼る |
| 壁との前後関係 | 表現できない（DOM は常に最前面） | 深度テストで GPU が解決 |
| 操作（hover / click / input） | ブラウザが普通に処理 | `updateElementGeometry` で画面上の位置を毎フレーム教える |
| 壁の裏のラベルへのクリック | 届く | 届く → **自前のレイキャストで当たり判定を外す** |
| 画像書き出し | ラベルが写らない | `canvas.toBlob()` に写る |
| 必要なもの | CSS だけ | シェーダ・テクスチャ管理・座標同期 |

> canvas 方式の実装量は、three.js を使えば `HTMLTexture` と `InteractionManager` が肩代わりする部分。
> ただし three.js 0.187 の `HTMLTexture` は旧 API（`layoutsubtree` / `texElementImage2D`）前提で、Chrome 157 の API とは合わない。

## ディレクトリ構成

```
src/
├── main.ts                    起動と配線だけ
├── strategies/                ★ 方式ごとの差分
│   ├── types.ts               LabelStrategy（差し込み口）
│   ├── overlay/overlay.ts     オーバーレイ方式
│   └── canvas/
│       ├── canvas.ts          HTML-in-Canvas 方式（paint / ヒットテスト同期）
│       └── billboard.ts       ラベルのテクスチャ転送とビルボード描画（WebGL）
├── shared/                    方式に依存しない部分
│   ├── scene.ts, scene-renderer.ts   床・壁・機器の定義と描画
│   ├── camera.ts                      オービットカメラ
│   ├── projection.ts                  3D のアンカー → 画面上の矩形、壁の裏の判定
│   ├── labels.ts                      ラベルの DOM と状態
│   └── math.ts, gl-utils.ts
├── demo/                      検証用の UI・計測・自動テスト
│   ├── app.ts                 フレームループ・方式切替・撮影
│   ├── panel.ts               サイドパネル
│   ├── selftest.ts            ページ内の自動テスト
│   └── live-values.ts         ラベルの HTML を 1 秒ごとに書き換える
└── types/html-in-canvas.d.ts  Chrome 157 の API の型定義
```

1 フレームの流れ（`demo/app.ts` の `renderFrame`）:

1. `projectLabels` … 共通。3D → 画面座標、壁の裏の判定、奥→手前のソート
2. `scene.draw` … 共通。床・壁
3. `strategy.update` … **ここだけ方式ごとに違う**

フレームを起動するタイミングも方式ごとに違う。overlay は `requestAnimationFrame` の中で直接描画する。
canvas は `requestPaint()` を呼び、`paint` イベントの中で描画する（HTML のスナップショットが有効なのがその間だけのため）。

## 検証でわかったこと（Chrome 157 / headless・ソフトウェア GL）

- 壁の裏のラベル: canvas 方式は深度テストで隠れる。overlay は透けて浮く。
- hover・クリック・入力: canvas 方式でも実マウスで反応する（`:hover`、ボタン、メモ欄への入力）。
- 画像書き出し: canvas 方式のみラベルが写る。
- 自動テスト: `querySelector` でラベルの文字を取れ、`elementFromPoint` が 3D 上のボタンを返す。
- 落とし穴: 当たり判定は画面上の矩形だけで決まり、3D の深度は見ない。壁の裏のラベルには自前で当たり判定を外す必要がある。
- 落とし穴: テクスチャは CSS px 解像度なので、近づくとにじむ。
- 性能: ピン 500 個でも fps に大差は出なかった。ソフトウェア GL での測定なので参考値。
- オービット時のラベルの遅れ: 描画ループ内で位置を更新する限り、overlay でも再現しなかった。

## 使っている API（Chrome 157）

- `<canvas content="drawable">` と、子要素の `drawable` 属性
- `canvas.onpaint` / `canvas.requestPaint()`（`CanvasPaintEvent.changedElements` で変化した要素が分かる）
- `canvas.getElementImageDefaultSize(el)`
- `gl.texElementSubImage2D(target, level, x, y, element)`
- `canvas.updateElementGeometry(el, { canvasTransform })` / `clearElementGeometry(el)`

参考: <https://developer.chrome.com/docs/web-platform/html-in-canvas>
