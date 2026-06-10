#!/usr/bin/env node
/**
 * Сопоставляет наши 177 брендов (src/data/casinos.json) со страницами
 * брендов на casino.ru (из их casino-sitemap, скачанного в /tmp/casinoru-sitemap.xml).
 *
 * Выдаёт reports/casino-match-map.json: { ourSlug: {ru, casinoRuSlug, conf} | null }
 * и печатает покрытие. Запуск: node scripts/casino-match.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ours = JSON.parse(readFileSync('src/data/casinos.json', 'utf-8'));
const smap = readFileSync('/tmp/casinoru-sitemap.xml', 'utf-8');

// Все URL casino.ru → берём только «обзорные» страницы бренда, без под-разделов
const urls = [...smap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const SUB = /^(otzyvy|bonusy|turniry|cashback|poleznoe|promokod|app|mobilnoe|zerkalo|registintsiya|registraciya|vhod|akcii|frispiny|bezdepozitnyj)/;

// Нормализация имени бренда в «ядро» (латиница+цифры)
const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const translit = (s) => s.toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('');
const core = (s) =>
  translit(String(s))
    .replace(/casino|kazino|казино/gi, '')
    .replace(/[^a-z0-9]/g, '');

// Кандидаты casino.ru: slug последнего сегмента, без под-префиксов
const candidates = new Map(); // core -> casinoRuSlug
for (const u of urls) {
  const seg = u.replace(/\/$/, '').split('/').pop();
  if (!seg || SUB.test(seg)) continue;
  // снять ведущий 'casino-' если есть
  const brandSlug = seg.replace(/^casino-/, '');
  const c = core(brandSlug);
  if (c.length >= 2 && !candidates.has(c)) candidates.set(c, seg);
}

// Левенштейн для фаззи
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

const candCores = [...candidates.keys()];
const map = {};
let exact = 0, fuzzy = 0, miss = 0;
const misses = [];

for (const [slug, info] of Object.entries(ours)) {
  const want = core(info.nameRu || slug);
  const wantSlug = core(slug);
  if (candidates.has(want)) { map[slug] = { ru: info.nameRu, casinoRuSlug: candidates.get(want), conf: 'exact' }; exact++; continue; }
  if (candidates.has(wantSlug)) { map[slug] = { ru: info.nameRu, casinoRuSlug: candidates.get(wantSlug), conf: 'exact' }; exact++; continue; }
  // фаззи: ближайший кандидат
  let best = null, bestD = 99;
  for (const c of candCores) {
    const d = lev(want, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  const maxLen = Math.max(want.length, best?.length || 1);
  if (best && bestD <= Math.max(1, Math.floor(maxLen * 0.25))) {
    map[slug] = { ru: info.nameRu, casinoRuSlug: candidates.get(best), conf: `fuzzy(${bestD})` }; fuzzy++;
  } else {
    map[slug] = null; miss++; misses.push(`${slug} (${info.nameRu})`);
  }
}

mkdirSync('reports', { recursive: true });
writeFileSync('reports/casino-match-map.json', JSON.stringify(map, null, 2) + '\n');
console.log(`Кандидатов-брендов на casino.ru: ${candidates.size}`);
console.log(`Наших брендов: ${Object.keys(ours).length}`);
console.log(`  точных совпадений: ${exact}`);
console.log(`  фаззи-совпадений:  ${fuzzy}`);
console.log(`  НЕ найдено:        ${miss}`);
console.log(`\nНе найдены (${misses.length}):`);
console.log('  ' + misses.join(', '));
