#!/usr/bin/env node
/**
 * Приводит строку приветственного бонуса в телах казино-страниц
 * к каноническим значениям из src/data/casinos.json (устраняет двойные числа).
 * Меняет строку таблицы:  | Приветственный | ... | ... |
 *
 * Запуск: node scripts/wire-casino-bodies.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const casinos = JSON.parse(readFileSync('src/data/casinos.json', 'utf-8'));
const DIR = 'src/pages/casino';
const files = readdirSync(DIR).filter((f) => f.endsWith('.mdx') && f !== 'metodologiya.mdx');

const ROW = /\|\s*Приветственный\s*\|[^|\n]*\|[^|\n]*\|/;
let changed = 0, noData = 0, noRow = 0;

for (const f of files) {
  const slug = f.replace(/\.mdx$/, '');
  const c = casinos[slug];
  if (!c || !c.bonus) { noData++; continue; }
  const path = join(DIR, f);
  const txt = readFileSync(path, 'utf-8');
  if (!ROW.test(txt)) { noRow++; continue; }
  const detail = c.bonusDetail ? `, ${c.bonusDetail}` : '';
  const wager = c.wager || '—';
  const row = `| Приветственный | ${c.bonus}${detail} | ${wager} |`;
  const out = txt.replace(ROW, row);
  if (out !== txt) { writeFileSync(path, out); changed++; }
}
console.log(`Обновлено строк бонуса: ${changed}`);
console.log(`Без данных в casinos.json: ${noData}`);
console.log(`Без строки 'Приветственный': ${noRow}`);
