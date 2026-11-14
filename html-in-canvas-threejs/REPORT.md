# HTML-in-Canvas × three.js 試作レポート

原典 `html-in-canvas-getstarted/`（素の WebGL2・ライブラリなし）と同じ体験を three.js で実装し直し、
「three.js を使うとどれだけ記述が減るか」を測るための試作。原典には一切手を入れていない。

## 結論サマリ

- **THREE.HTMLTexture は Chrome 157 では使えない**（下記「互換性調査」）。そのため three.js は
  シーン／カメラ／メッシュ／操作に使い、テクスチャ転送だけ薄い自前ラッパー
  （`src/element-texture.ts`、48 行）を書いた。
- 動作は実ブラウザ（Chrome for Testing 158）で検証済み。ラベルの表示・壁による遮蔽・
  hover／click／文字入力・toBlob 撮影への写り込み、すべて原典と同等に動く。
- コード量は対応範囲で **679 行 → 358 行（約 47%）** に減った（詳細は「LOC 比較」）。

## 互換性調査: THREE.HTMLTexture はなぜ使えないか

対象: three **0.187.0**（2026-11 時点の npm latest。そのまま `npm i three` で入る版）。

1. `node_modules/three/src/renderers/webgl/WebGLTextures.js`（r187）の HTMLTexture 転送部は
   旧名 **`texElementImage2D`**（3 引数形と 6 引数形の両方）と **`layoutsubtree`** 属性しか使っていない。
   `src/textures/HTMLTexture.js` 本体も「親 canvas の paint で needsUpdate を立てる」だけの薄い実装。
2. Chrome 側の実測（この環境の Chrome for Testing **158.0.8127.18**、Playwright で probe）:
   - `'texElementImage2D' in gl` → **false**（Chrome 155 の改名で削除済み）
   - `'texElementSubImage2D' in gl` → **true**
   - `canvas.content` / `requestPaint` / `updateElementGeometry` / `getElementImageDefaultSize` → すべて true
3. つまり r187 の転送部は `'texElementImage2D' in _gl` の時点で分岐に入れず、**転送が一切走らない**
   （テクスチャは真っ白になる）。GitHub 側でも Chromium 150 の 3 引数形対応（PR #33788）までしか
   追いついておらず、155 の `texElementSubImage2D` 改名への対応 PR は見つからなかった。

### 採用した経路（ElementTexture ラッパー）

すべて three の公開 API + 標準 WebGL2 で構成した。

1. 通常の `THREE.Texture`（中身はダミーの小 canvas）を作り、`renderer.initTexture()` で
   three に GL テクスチャ実体を先に作らせる。
2. paint イベントの中で `renderer.properties.get(texture).__webglTexture` から GL 実体を取り出し、
   生 WebGL2 で `texImage2D(..., null)`（サイズ変更時のみ再確保）+ `texElementSubImage2D` で中身を差し替える。
   `texture.version` は上げないので three がダミー画像から再転送することはない。
3. 生 GL を触った直後に `renderer.resetState()` を呼び、three の GL 状態キャッシュを合わせ直してから
   `renderer.render()` する。
4. 合成は乗算済みアルファ前提（転送時に `UNPACK_PREMULTIPLY_ALPHA_WEBGL`）で、マテリアル側も
   `CustomBlending`（ONE / ONE_MINUS_SRC_ALPHA）にした。原典 billboard と同じ取り決め。
   flipY は three 標準の約束に合わせ `UNPACK_FLIP_Y_WEBGL` で吸収。

注意点: `__webglTexture` は three の内部プロパティ（`properties` 自体と `initTexture` / `resetState` は公開 API）。
three のバージョンを上げたら最初に壊れうる場所はここ。

## 原典との対応

| 項目 | 原典（素の WebGL2） | この試作（three.js） |
|---|---|---|
| 箱シーン描画 | scene-renderer.ts（頂点生成＋自前シェーダ） | BoxGeometry + MeshLambertMaterial |
| 陰影 | 自前シェーダ `0.55 + 0.45*max(dot(n,L),0)` | Ambient + Directional（r155 以降は強度が π で割られるので π 倍して一致させた） |
| カメラ | 自前 OrbitCamera + 行列計算（math.ts） | PerspectiveCamera + OrbitControls |
| ラベル転送 | billboard.ts（自前 VAO/シェーダ） | ElementTexture ラッパー + PlaneGeometry のビルボード |
| 遮蔽（見た目） | 深度テスト | 深度テスト（同じ） |
| 遮蔽（ヒットテスト） | projection.ts の CPU レイキャスト（segmentHitsAabb） | THREE.Raycaster で壁メッシュへ |
| ヒットテスト同期 | updateElementGeometry / clearElementGeometry | 同じ（投影計算は three の行列で再現） |
| 駆動 | rAF → requestPaint → onpaint 内描画 | 同じ |
| 撮影 | canvas.toBlob（描画直後） | 同じ |

### 実装中に踏んだ three.js 固有の落とし穴

- **OrbitControls が click を壊す**: OrbitControls の `onPointerDown` は対象を問わず
  `domElement.setPointerCapture()` するため、canvas の子であるラベル起点の pointerdown が
  canvas に伝播すると pointerup が奪われ、ボタンへの click が成立しない（hover は効くのに click だけ届かない）。
  対策として各ラベルの `pointerdown` で `stopPropagation()` した。
  原典の自前カメラは `e.target !== canvas` チェックで同じ問題を回避していた箇所。
- **ライトの π 問題**: 上記の通り。素の係数をそのまま入れると全体が約 1/π 倍の明るさになり真っ暗になる。
- **`getElementImageDefaultSize` は paint の外だと例外**（"No cached paint record for element"）。
  原典と同じく paint 内でのみ呼ぶ。
- **色変換**: 原典は色変換なしで値をそのまま出している。three 側は
  `renderer.outputColorSpace = LinearSRGBColorSpace` にして素通しに合わせた
  （Basic マテリアルの読み戻しで入力値＝出力値になることを確認済み）。

## ファイル構成

```
index.html                  UI（タイトル／撮影ボタン／撮影結果／ログ／未対応警告）
src/
  main.ts                   配線・シーン構築・フレーム駆動・ヒットテスト同期・撮影
  element-texture.ts        テクスチャ転送ラッパー（上記経路）
  labels.ts                 ラベル DOM 生成（原典 labels.ts を最小化して移植）
  scene-data.ts             BOXES / MAIN_TAGS 等のデータ（原典 scene.ts からコピー）
  types/html-in-canvas.d.ts Chrome 157 API の型定義（原典と同じ）
scripts/
  verify.ts                 実ブラウザ検証（下記）
  loc.ts                    コード行数カウント（原典と同じ数え方）
verify-shots/               検証スクリーンショット
```

ピンは原典の 30 個ではなく **8 個** に絞った（試作を lean に保つため）。パネル／自己テスト／
live-values 等の検証用ツール類は移植していない。

## 動かし方

pnpm が無い環境では npm で代替した（成果物は同じ）。

```
npm install
npm run dev      # vite dev サーバー
npm run build    # tsc --noEmit && vite build（型チェック込み）
npx vite preview --port 5199
node scripts/verify.ts http://localhost:5199/ verify-shots
```

ブラウザは Chrome 157 以降が必須（HTML-in-Canvas のため）。

## LOC 比較

数え方は原典 `scripts/loc.ts` と同一（空行とコメントだけの行を除くコード行）。

| | 行数 |
|---|---|
| 試作 src/main.ts | 213 |
| 試作 src/element-texture.ts | 48 |
| 試作 src/labels.ts | 57 |
| 試作 src/scene-data.ts | 40 |
| **試作 src 合計（型定義 d.ts 26 行を除く）** | **358** |
| 原典 対応範囲（strategies 一式 + shared の scene/scene-renderer/camera/projection/gl-utils/math + demo/app.ts） | **679** |

参考: ラベル生成（原典 shared/labels.ts 81 行）まで含めた同士の比較では 760 行 → 358 行（約 53% 減）。
削減の主因は math.ts（86 行）・scene-renderer.ts（111 行）・camera.ts（66 行）が three に置き換わったことと、
billboard.ts の描画足場（82 行）が PlaneGeometry + マテリアル指定で消えたこと。
逆に減らなかったのはヒットテスト同期と paint 駆動まわりで、これは HTML-in-Canvas 固有の仕事なので
ライブラリでは肩代わりできない（HTMLTexture / InteractionManager が担うはずの部分だが、上記の通り現行版は使えない）。

## 検証（実ブラウザ）

環境: Chrome for Testing 158.0.8127.18（Playwright 同梱、SwiftShader ソフトウェア GL）、
対象は production build を `vite preview` で配信したもの。`scripts/verify.ts` の全チェック PASS、
コンソールエラー 0 件。原典も同じ環境で動かして見た目を突き合わせた。

| スクリーンショット | 目視で確認したこと |
|---|---|
| verify-shots/01-initial.png | 初期視点。床（青／緑）・壁・機器の箱と、会議室A・AHU-01 のタグ、ピンのラベルが 3D 上に読める形で表示。壁の裏の FCU-12 は深度で隠れて見えない |
| verify-shots/02-flipped.png | 反対側視点。執務室B・FCU-12 が手前に読める。A 側タグは壁の向こう |
| verify-shots/03-input.png | FCU-12 のメモ欄に実マウス＋実キー入力で「テスト入力」が入り、フォーカス枠も表示。ログにも input イベントが並ぶ |
| verify-shots/04-capture-panel.png | 撮影ボタンで得た toBlob 画像（パネル内表示）。ラベル入りで写っている |
| verify-shots/capture-raw.png | toBlob の生 PNG。ラベル・ピンまで含めて写っている |
| verify-shots/05-occlusion-low.png | 低アングル（pitch 0.18）。計算上も occluded=true の 執務室B・FCU-12 が画面から消えている（01 では壁の上から覗いていた 執務室B も消える） |

プログラムでの確認（verify.ts）:
- 対応 probe: `texElementSubImage2D` あり / `texElementImage2D` なし（互換性調査の再確認）
- hover: 実マウスで roomA のボタンが `:hover` になる
- click: 「詳細」ボタンの実クリックでカウンタが 1 になる（+ 上記の stopPropagation 対策）
- input: FCU-12 メモ欄へ実タイプで値が入り、`document.activeElement` もその input
- elementFromPoint: roomA タグ中心でタグ内の要素（`.value`）が返る＝ヒットテスト登録が効いている
- capture: `captureDataUrl()` が PNG data URL を返し、ファイルに保存できた

コード確認のみ（実機未確認）なもの: 実 GPU 環境での描画（検証は SwiftShader のみ）、
DPR 2 以上の画面でのテクスチャ解像度、ピン大量表示時の fps（原典の 500 個計測は未移植）。

## 既知の制限・リスク

- **three の内部プロパティ依存**: `renderer.properties.get(texture).__webglTexture` を使っている。
  three を更新したら ElementTexture から先に確認すること。HTMLTexture が 157 対応したら
  このラッパーは丸ごと置き換え可能（その場合 main.ts の変更は tex 生成部分だけのはず）。
- **テクスチャ解像度は CSS px**（原典と同じ落とし穴）。近づくと文字がにじむ。DPR 分の
  高解像度化は `getElementImageDefaultSize` の返す寸法依存で、今回は未検証。
- **ピン 8 個固定**。原典のようなピン数スライダーと fps 計測は未移植。
- **初回フレームだけラベルが空白**になりうる（GL テクスチャ確保→転送が最初の paint で行われるため）。
  rAF 駆動ですぐ解消するが、静止画 1 枚だけの用途では注意。
- OrbitControls のズーム（wheel）はラベル上でも canvas に届く（伝播を止めていない）ため、
  ラベルにホイールするとカメラがズームする。原典も同じ挙動。
