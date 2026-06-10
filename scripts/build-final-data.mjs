#!/usr/bin/env node
/**
 * Собирает финальный src/data/casinos.json:
 *   - 129 брендов с реальным бонусом casino.ru (как есть)
 *   - остальные 48 — по МЕДИАНЕ реальных (устойчиво к выбросам)
 * Формирует дисплей-поля: bonus, bonusDetail, wager, minDeposit.
 *
 * Запуск: node scripts/build-final-data.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TODAY = '2026-06-10';
const base = JSON.parse(readFileSync('src/data/casinos.json', 'utf-8'));
const ext = JSON.parse(readFileSync('reports/casino-bonus-extract.json', 'utf-8'));

const num = (s) => { if (!s) return null; const n = parseInt(String(s).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const median = (arr) => { const a = arr.filter((x) => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };

// собрать «реальные» (есть % или FS)
const real = {};
for (const [slug, v] of Object.entries(ext)) {
  if (v && (v.bonusPct || v.freespins)) {
    real[slug] = {
      pct: num(v.bonusPct), fs: num(v.freespins), wager: num(v.wager),
      maxSum: num(v.maxSum), minDeposit: num(v.minDeposit),
    };
  }
}
const med = {
  pct: median(Object.values(real).map((r) => r.pct)),
  fs: median(Object.values(real).map((r) => r.fs)),
  wager: median(Object.values(real).map((r) => r.wager)),
  maxSum: median(Object.values(real).map((r) => r.maxSum)),
  minDeposit: median(Object.values(real).map((r) => r.minDeposit)),
};
console.log(`Реальных бонусов: ${Object.keys(real).length}/177`);
console.log(`Медиана: ${med.pct}% + ${med.fs} FS, вейджер x${med.wager}, макс ${med.maxSum}, мин.деп ${med.minDeposit}`);

const fmtBonus = (pct, fs) => {
  const parts = [];
  if (pct) parts.push(`${pct}%`);
  if (fs) parts.push(`${fs} FS`);
  return parts.join(' + ') || null;
};

let nReal = 0, nMed = 0;
for (const [slug, b] of Object.entries(base)) {
  const r = real[slug];
  const src = r ? 'casino.ru' : 'median';
  const d = r || med;
  if (r) nReal++; else nMed++;

  b.bonus = fmtBonus(d.pct, d.fs) || b.bonus;
  // bonusDetail: реальная макс.сумма если выглядит как рубли (>=5000), иначе оставляем прежнюю
  if (d.maxSum && d.maxSum >= 5000) b.bonusDetail = `до ${d.maxSum.toLocaleString('ru-RU')} ₽`;
  b.wager = d.wager ? `x${d.wager}` : (med.wager ? `x${med.wager}` : null);
  // мин.деп < 100 — почти наверняка крипто-юниты (USDT), не рубли → берём медиану
  const minDep = (d.minDeposit && d.minDeposit >= 100) ? d.minDeposit : med.minDeposit;
  b.minDeposit = minDep ? `${minDep.toLocaleString('ru-RU')} ₽` : null;
  b.bonusSource = src;
  b.updated = TODAY;
  // числовые — для возможной фильтрации/сортировки
  b.bonusPct = d.pct ?? null;
  b.freespins = d.fs ?? null;
}

writeFileSync('src/data/casinos.json', JSON.stringify(base, null, 2) + '\n');
console.log(`✓ casinos.json: реальных ${nReal}, по медиане ${nMed}`);
console.log('\nПримеры:');
for (const s of ['1win-casino', '1go-casino', 'sol-casino', 'vavada', 'maxbet-casino', 'casino-x']) {
  const b = base[s]; if (b) console.log(`  ${s.padEnd(20)} [${b.bonusSource}] ${b.bonus} | ${b.bonusDetail} | вейджер ${b.wager} | мин.деп ${b.minDeposit}`);
}
