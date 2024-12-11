// merge_obj_with_three.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 現在のディレクトリを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// modelsディレクトリのパス
const modelsDir = path.join(__dirname, 'models');

// 出力ファイルパス
const outputFilePath = path.join(__dirname, 'merged.obj');

// OBJLoader のインスタンス作成
const loader = new OBJLoader();

// メッシュを統合するためのグループを作成
const mergedGroup = new THREE.Group();

/**
 * OBJファイルを読み込む関数
 * @param {string} filePath - OBJファイルのパス
 * @returns {THREE.Object3D} - 読み込まれたオブジェクト
 */
async function loadOBJ(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const object = loader.parse(content);
  return object;
}

/**
 * ジオメトリの属性を確認・補完する関数
 * @param {THREE.BufferGeometry} geometry - チェックするジオメトリ
 */
function ensureGeometryAttributes(geometry) {
  // position は必須
  if (!geometry.attributes.position) {
    throw new Error('Geometry is missing position attribute');
  }

  // normal がない場合、計算する
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  // uv がない場合、追加する（空のUVを追加）
  if (!geometry.attributes.uv) {
    const uvCount = geometry.attributes.position.count;
    const uv = new Float32Array(uvCount * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // 他に必要な属性があればここで追加
}

/**
 * modelsディレクトリ内の全てのOBJファイルを取得する関数
 * @param {string} dir - ディレクトリのパス
 * @returns {Array<string>} - OBJファイルのパスの配列
 */
function getAllOBJFiles(dir) {
  const files = fs.readdirSync(dir);
  return files.filter(file => path.extname(file).toLowerCase() === '.obj')
    .map(file => path.join(dir, file));
}

/**
 * 複数のOBJファイルをマージして1つのOBJファイルとしてエクスポートする関数
 * @param {Array<string>} objFilePaths - OBJファイルのパスの配列
 * @param {string} outputFilePath - 出力先のファイルパス
 */
async function mergeOBJFiles(objFilePaths, outputFilePath) {
  // オフセットの初期値とステップ
  const initialOffset = { x: 0, y: 0 };
  const stepOffset = { x: 3000, y: 2000 };

  // 各OBJファイルを読み込み、オフセットを適用してグループに追加
  for (let i = 0; i < objFilePaths.length; i++) {
    const filePath = objFilePaths[i];
    try {
      const object = await loadOBJ(filePath);

      // オフセットを計算
      const offsetX = initialOffset.x + stepOffset.x * i;
      const offsetY = initialOffset.y + stepOffset.y * i;

      // オフセットを適用
      object.position.set(offsetX, offsetY, 0);
      object.updateMatrixWorld(true);

      // グループに追加
      mergedGroup.add(object);
    } catch (err) {
      console.error(`Error loading OBJ file "${filePath}":`, err);
    }
  }

  // ジオメトリを収集
  let geometries = [];

  mergedGroup.traverse((child, childIndex) => {
    if (child.isMesh) {
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);

      // console.log(`Geometry from "${child.name || 'Unnamed Mesh'}":`);
      // console.log('Attributes:', Object.keys(geometry.attributes));

      try {
        ensureGeometryAttributes(geometry);
        geometries.push(geometry);
      } catch (err) {
        console.error(`Geometry at child index ${childIndex} is invalid:`, err);
      }
    }
  });

  // 全てのジオメトリが収集されたか確認
  if (geometries.length === 0) {
    throw new Error('No valid geometries to merge');
  }

  // BufferGeometryUtils を使用してジオメトリをマージ
  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);

  if (!mergedGeometry) {
    throw new Error('ジオメトリのマージに失敗しました');
  }

  // マージされたジオメトリでメッシュを作成
  const mergedMesh = new THREE.Mesh(mergedGeometry);

  // OBJExporter を使用してエクスポート
  const exporter = new OBJExporter();
  const exportedOBJ = exporter.parse(mergedMesh);

  // ファイルに書き込む
  fs.writeFileSync(outputFilePath, exportedOBJ, 'utf-8');

  console.log(`統合された OBJ ファイルが作成されました: ${outputFilePath}`);
}

// 実行部分
(async () => {
  try {
    const objFilePaths = getAllOBJFiles(modelsDir);
    if (objFilePaths.length === 0) {
      console.warn('modelsディレクトリにOBJファイルが見つかりませんでした。');
      return;
    }
    console.log(`見つかったOBJファイル数: ${objFilePaths.length}`);
    await mergeOBJFiles(objFilePaths, outputFilePath);
  } catch (err) {
    console.error('Error merging OBJ files:', err);
  }
})();
