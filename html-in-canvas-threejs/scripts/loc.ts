// src/ 配下のコード行数を数える（原典 scripts/loc.ts と同じ数え方: 空行とコメントだけの行は数えない）。
// 使い方: node scripts/loc.ts [対象ディレクトリ]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

export function codeLines(file: string): number {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? 'src';
  let total = 0;
  for (const f of files(target)) {
    const n = codeLines(f);
    total += n;
    console.log(`${String(n).padStart(5)} 行  ${f}`);
  }
  console.log(`${String(total).padStart(5)} 行  合計 (${target})`);
}
