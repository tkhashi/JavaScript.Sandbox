// 方式ごとの実装量（コード行数）を数える。空行とコメントだけの行は数えない。
// 使い方: pnpm loc
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

function codeLines(file: string): number {
  let inBlock = false;
  let n = 0;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line === '' || line.startsWith('//')) continue;
    n++;
  }
  return n;
}

const groups: [string, string][] = [
  ['overlay 方式（strategies/overlay）', 'src/strategies/overlay'],
  ['canvas 方式（strategies/canvas）', 'src/strategies/canvas'],
  ['共通: 方式の差し込み口（strategies/types.ts）', 'src/strategies/types.ts'],
  ['共通: シーン・カメラ・座標計算（shared）', 'src/shared'],
  ['検証用デモ UI・計測・自動テスト（demo, main）', 'src/demo'],
];

for (const [label, path] of groups) {
  const list = statSync(path).isDirectory() ? files(path) : [path];
  console.log(`${String(list.reduce((s, f) => s + codeLines(f), 0)).padStart(5)} 行  ${label}`);
  if (path.startsWith('src/strategies/') && statSync(path).isDirectory()) {
    for (const f of list) console.log(`        - ${f.replace('src/', '')}: ${codeLines(f)}`);
  }
}
