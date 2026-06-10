#!/usr/bin/env node
/**
 * Сжимает title (≤60) и description (≤155) на казино-страницах.
 * Title — пересобирается из бренда по адаптивному шаблону.
 * Description — пересобирается по шаблону (текущие описания и так дубли-шаблоны).
 *
 * Запуск:
 *   node scripts/seo-tighten-meta.mjs           # DRY: только примеры и статистика
 *   node scripts/seo-tighten-meta.mjs --apply    # записать изменения в файлы
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/pages/casino';
const APPLY = process.argv.includes('--apply');
const TITLE_MAX = 60;
const DESC_MAX = 155;

const files = readdirSync(DIR).filter((f) => f.endsWith('.mdx') && f !== 'metodologiya.mdx');

function brandFrom(title) {
  // 1) Латинский бренд из хвоста "Приложение X Casino APK"
  const en = title.match(/Приложение\s+(.+?)\s+Casino\s+APK/i);
  if (en) return en[1].trim();
  // 2) fallback — то, что до " казино"
  const ru = title.split(/\s*казино/i)[0];
  return ru.trim();
}

function makeTitle(brand) {
  const variants = [
    `${brand} казино: скачать APK на Андроид бесплатно`,
    `${brand} казино: скачать APK на Андроид`,
    `${brand} казино: скачать на Андроид`,
    `${brand}: скачать на Андроид`,
  ];
  return variants.find((v) => v.length <= TITLE_MAX) ?? variants[variants.length - 1].slice(0, TITLE_MAX);
}

function makeDesc(brand) {
  const variants = [
    `Скачать ${brand} Casino на Android: APK бесплатно, бонус за установку и быстрый вывод. Инструкция по установке, требования и обзор приложения.`,
    `Скачать ${brand} Casino на Android: APK бесплатно, бонус за установку и быстрый вывод. Инструкция и обзор приложения.`,
    `Скачать ${brand} Casino на Android: APK бесплатно, бонус и быстрый вывод. Обзор приложения.`,
  ];
  return variants.find((v) => v.length <= DESC_MAX) ?? variants[variants.length - 1].slice(0, DESC_MAX);
}

let changed = 0;
const samples = [];
let maxT = 0, maxD = 0;

for (const f of files) {
  const path = join(DIR, f);
  const txt = readFileSync(path, 'utf-8');
  const tMatch = txt.match(/^title:\s*"(.*?)"\s*$/m);
  const dMatch = txt.match(/^description:\s*"(.*?)"\s*$/m);
  if (!tMatch || !dMatch) continue;
  const oldT = tMatch[1], oldD = dMatch[1];
  const brand = brandFrom(oldT);
  const newT = makeTitle(brand);
  const newD = makeDesc(brand);
  maxT = Math.max(maxT, newT.length);
  maxD = Math.max(maxD, newD.length);

  if (samples.length < 6) samples.push({ f, brand, oldT, newT, oldD, newD });

  if (APPLY) {
    let out = txt.replace(/^title:\s*".*?"\s*$/m, `title: "${newT}"`);
    out = out.replace(/^description:\s*".*?"\s*$/m, `description: "${newD}"`);
    if (out !== txt) { writeFileSync(path, out); changed++; }
  }
}

console.log(`Файлов обработано: ${files.length}`);
console.log(`Макс. длина нового title: ${maxT} (лимит ${TITLE_MAX})`);
console.log(`Макс. длина нового description: ${maxD} (лимит ${DESC_MAX})`);
console.log(APPLY ? `\nЗАПИСАНО изменений: ${changed}` : `\n=== DRY-RUN (ничего не записано) ===`);
console.log('\n=== ПРИМЕРЫ до/после ===');
for (const s of samples) {
  console.log(`\n[${s.f}]  бренд="${s.brand}"`);
  console.log(`  TITLE  было[${s.oldT.length}]: ${s.oldT}`);
  console.log(`  TITLE  стало[${s.newT.length}]: ${s.newT}`);
  console.log(`  DESC   было[${s.oldD.length}]: ${s.oldD.slice(0, 80)}...`);
  console.log(`  DESC   стало[${s.newD.length}]: ${s.newD}`);
}
