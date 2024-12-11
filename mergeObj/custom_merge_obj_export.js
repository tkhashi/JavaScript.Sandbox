// custom_obj_export.js

import fs from 'fs';
import * as THREE from 'three';

/**
 * カスタムOBJエクスポーター
 * @param {THREE.Group} group - エクスポートするグループ
 * @param {string} outputPath - 出力先のファイルパス
 */
export function customOBJExporter(group, outputPath) {
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  let vertexOffset = 1; // OBJのインデックスは1から始まる

  writeStream.write('# Merged OBJ File\n');

  group.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry;
      const position = geometry.attributes.position;
      const normal = geometry.attributes.normal;
      const uv = geometry.attributes.uv;

      // メッシュ名
      const meshName = child.name || 'Unnamed_Mesh';
      writeStream.write(`o ${meshName}\n`);

      // 頂点座標
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        writeStream.write(`v ${x} ${y} ${z}\n`);
      }

      // テクスチャ座標
      if (uv) {
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i);
          const v = uv.getY(i);
          writeStream.write(`vt ${u} ${v}\n`);
        }
      }

      // 法線ベクトル
      if (normal) {
        for (let i = 0; i < normal.count; i++) {
          const nx = normal.getX(i);
          const ny = normal.getY(i);
          const nz = normal.getZ(i);
          writeStream.write(`vn ${nx} ${ny} ${nz}\n`);
        }
      }

      // 面情報
      const indices = geometry.index ? geometry.index.array : Array.from({ length: position.count }, (_, i) => i);
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] + vertexOffset;
        const b = indices[i + 1] + vertexOffset;
        const c = indices[i + 2] + vertexOffset;

        if (uv && normal) {
          writeStream.write(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n`);
        } else if (uv) {
          writeStream.write(`f ${a}/${a} ${b}/${b} ${c}/${c}\n`);
        } else if (normal) {
          writeStream.write(`f ${a}//${a} ${b}//${b} ${c}//${c}\n`);
        } else {
          writeStream.write(`f ${a} ${b} ${c}\n`);
        }
      }

      writeStream.write('\n');

      vertexOffset += position.count;
    }
  });

  writeStream.end();
}
