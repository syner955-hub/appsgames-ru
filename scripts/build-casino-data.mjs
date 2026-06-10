#!/usr/bin/env node
/**
 * Шаг 1-2 консолидации данных по казино:
 *  1) Извлекает структурированные данные 177 брендов из хаба casino/index.astro
 *     → src/data/casinos.json (единый источник правды, черновик).
 *  2) Сверяет бонус/лицензию хаба с телом каждой страницы casino/*.mdx
 *     → reports/casino-data-discrepancies.md (отчёт о расхождениях).
 *
 * Ничего на сайте не меняет. Запуск: node scripts/build-casino-data.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HUB = 'src/pages/casino/index.astro';
const MDX_DIR = 'src/pages/casino';

// --- 1. Извлекаем массив brands из хаба ---
const hubSrc = readFileSync(HUB, 'utf-8');
const start = hubSrc.indexOf('const brands = [');
const end = hubSrc.indexOf('\n];', start);
if (start === -1 || end === -1) throw new Error('Не найден массив brands');
const arrLiteral = hubSrc.slice(start + 'const brands = '.length, end + 2);
// Безопасный eval литерала массива
const brands = eval(arrLiteral); // eslint-disable-line no-eval

const slugOf = (href) => href.replace(/^\/casino\//, '').replace(/\/$/, '');

const data = {};
for (const b of brands) {
  const slug = slugOf(b.href);
  data[slug] = {
    nameRu: b.name,
    bonus: b.bonus ?? null,
    bonusDetail: b.bonusDetail ?? null,
    license: b.license ?? null,
    pros: b.pros ?? [],
    image: b.image ?? null,
    affiliate: b.link ?? null,
    // поля для будущего обогащения (реальными данными):
    wager: null,
    minDeposit: null,
    withdrawal: null,
    providers: [],
    payments: [],
    rating: null,
    votes: null,
    updated: null,
    source: 'hub-import',
  };
}

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/casinos.json', JSON.stringify(data, null, 2) + '\n');
console.log(`✓ src/data/casinos.json — ${Object.keys(data).length} брендов`);

// --- 2. Сверка с телами страниц ---
const files = readdirSync(MDX_DIR).filter((f) => f.endsWith('.mdx') && f !== 'metodologiya.mdx');
const issues = [];
const PCT = /(\d{2,4})\s*%/g;            // проценты бонуса
const LIC = /(Curaçao|Кюрасао|Curacao|MGA|Anjouan|без лицензии)/i;

for (const f of files) {
  const slug = f.replace(/\.mdx$/, '');
  const hub = data[slug];
  if (!hub) { issues.push({ slug, type: 'НЕТ в хабе', detail: 'страница есть, в хабе бренда нет' }); continue; }
  const body = readFileSync(join(MDX_DIR, f), 'utf-8');

  // бонус-проценты в теле
  const bodyPcts = [...body.matchAll(PCT)].map((m) => m[1]);
  const hubPct = (hub.bonus || '').match(/(\d{2,4})\s*%/)?.[1];
  if (hubPct && bodyPcts.length && !bodyPcts.includes(hubPct)) {
    issues.push({
      slug, type: 'БОНУС %',
      detail: `хаб: ${hubPct}%  |  тело: ${[...new Set(bodyPcts)].join('%, ')}%`,
    });
  }
  // лицензия
  const bodyLic = body.match(LIC)?.[1];
  if (hub.license && bodyLic) {
    const norm = (s) => s.toLowerCase().replace('кюрасао', 'curaçao').replace('curacao', 'curaçao');
    if (norm(hub.license) !== norm(bodyLic)) {
      issues.push({ slug, type: 'ЛИЦЕНЗИЯ', detail: `хаб: ${hub.license}  |  тело: ${bodyLic}` });
    }
  }
}

// отчёт
mkdirSync('reports', { recursive: true });
const byType = issues.reduce((a, i) => ((a[i.type] = (a[i.type] || 0) + 1), a), {});
let md = `# Отчёт о расхождениях данных по казино\n\n`;
md += `Источник правды (черновик): \`src/data/casinos.json\` (импорт из хаба).\n`;
md += `Сверено страниц: ${files.length}. Найдено расхождений: **${issues.length}**.\n\n`;
md += `## Сводка по типам\n\n`;
for (const [t, n] of Object.entries(byType)) md += `- **${t}**: ${n}\n`;
md += `\n## Детали\n\n| Бренд | Тип | Расхождение |\n|---|---|---|\n`;
for (const i of issues.sort((a, b) => a.type.localeCompare(b.type) || a.slug.localeCompare(b.slug))) {
  md += `| ${i.slug} | ${i.type} | ${i.detail} |\n`;
}
writeFileSync('reports/casino-data-discrepancies.md', md);
console.log(`✓ reports/casino-data-discrepancies.md — расхождений: ${issues.length}`);
console.log('\nСводка:', byType);
