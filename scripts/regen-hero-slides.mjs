#!/usr/bin/env node
/**
 * Перегенерация 6 hero-картинок для главной страницы.
 *
 * Что делает:
 *   1. Читает все MDX (как это делает src/pages/index.astro).
 *   2. Сортирует по pubDate desc, приоритет — свежие из /novosti/.
 *   3. Берёт топ-6 (= то, что реально показывается в HeroCarousel).
 *   4. Для каждой:
 *        - формирует сцену из title + description + category;
 *        - добавляет стиль-пресет (product photo / hands / flat-lay / macro)
 *          по хэшу slug — тот же, что в scripts/generate-ai-hero.mjs;
 *        - генерит 1024x1024 через FLUX 2 Pro;
 *        - ресайзит в 1200x630 webp и пишет в public/images/hero/<slug>.webp
 *          (перезаписывая старую AI-шную обложку);
 *        - если у MDX ещё нет frontmatter поля `hero:` — дописывает его.
 *
 * Запуск:
 *   NANO_GPT_API_KEY=sk-nano-... node scripts/regen-hero-slides.mjs
 *
 * Стоимость:
 *   6 × FLUX 2 Pro ≈ $0.25 на Nano-GPT.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PAGES_DIR = path.join(ROOT, 'src/pages');
const HERO_DIR = path.join(ROOT, 'public/images/hero');
const TOKEN = process.env.NANO_GPT_API_KEY;
const MODEL = process.env.NANO_GPT_MODEL || 'flux-2-pro';
const LIMIT = Number(process.env.HERO_LIMIT || 6);

if (!TOKEN) {
  console.error('NANO_GPT_API_KEY не задан.');
  process.exit(1);
}

// --- style presets (должны быть идентичны generate-ai-hero.mjs) ---
const STYLE_PRESETS = [
  {
    id: 'product',
    style:
      'professional product photography, modern smartphone on a clean desk, ' +
      'soft diffused studio lighting, subtle reflections, shallow depth of field, ' +
      '35mm lens look, natural color grading, minimal props, bokeh background, ' +
      'no visible text, no brand logos, no letters, no watermark, high detail, realistic',
  },
  {
    id: 'hands',
    style:
      'close-up lifestyle photo of a person holding a smartphone, focus on the device, ' +
      'natural indoor window light, warm ambient colors, slightly blurred background, ' +
      '50mm lens, editorial tech magazine feel, candid and believable, ' +
      'no visible text on screen, no logos, no letters, no watermark, photorealistic',
  },
  {
    id: 'workspace',
    style:
      'overhead flat-lay photograph of a tidy modern workspace with a smartphone, ' +
      'coffee cup, notebook and plant, soft daylight from the side, clean wooden or ' +
      'concrete surface, muted palette with one accent color, editorial lifestyle photography, ' +
      'no readable text, no logos, no letters, no watermark, photorealistic',
  },
  {
    id: 'macro',
    style:
      'macro photograph of a smartphone detail (screen edge, camera ring, or side button), ' +
      'studio softbox lighting, extreme clarity, glossy and matte material contrast, ' +
      'ultra-shallow depth of field, cinematic color grading, dark moody background, ' +
      'no text, no logos, no letters, no watermark, hyperrealistic',
  },
];

function stylePresetFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
  return STYLE_PRESETS[Math.abs(h) % STYLE_PRESETS.length];
}

// --- найти все MDX ------------------------------------------------
async function walkMdx(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkMdx(p, out);
    else if (e.isFile() && e.name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

// --- минимальный YAML frontmatter парсер --------------------------
function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: content };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!mm) continue;
    let val = mm[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    fm[mm[1]] = val;
  }
  return { fm, body: m[2], raw: m[1] };
}

function toUrl(fp) {
  const rel = path.relative(PAGES_DIR, fp).replace(/\\/g, '/');
  return '/' + rel.replace(/\/index\.mdx$/, '/').replace(/\.mdx$/, '/');
}

// --- Nano-GPT image API -------------------------------------------
async function genImage(prompt) {
  const res = await fetch('https://nano-gpt.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Nano-GPT ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const item = data?.data?.[0];
  if (!item) throw new Error('empty data');
  if (item.url) return { url: item.url, cost: data.cost, remaining: data.remainingBalance };
  if (item.b64_json) return { b64: item.b64_json, cost: data.cost, remaining: data.remainingBalance };
  throw new Error('no url/b64');
}

async function downloadBuffer(r) {
  if (r.url) {
    const res = await fetch(r.url);
    if (!res.ok) throw new Error(`download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return Buffer.from(r.b64, 'base64');
}

// --- сборка сцены по frontmatter ----------------------------------
function buildScene(fm, url) {
  const title = fm.title || fm.h1 || '';
  const desc = fm.description || '';
  const cat = (fm.category || '').toLowerCase();

  // тематические якоря — подсказки для FLUX про предметы в кадре
  let subject = 'a modern smartphone';
  if (/android/.test(cat) || /android/i.test(url)) subject = 'a modern android-style smartphone';
  if (/ios|iphone|apple/.test(cat) || /iphone|ios/i.test(url)) subject = 'a modern iphone-style smartphone';

  let accent = '';
  if (/безопас|secur/i.test(title + ' ' + desc)) accent = ', subtle security mood, one small padlock-like object nearby';
  if (/батар|charge|заряд/i.test(title + ' ' + desc)) accent = ', a minimalist charging cable plugged in, warm ambient light';
  if (/мессендж|чат|telegram|whatsapp/i.test(title + ' ' + desc)) accent = ', soft ambient light, chat-app colors (green/cyan)';
  if (/обнов|update|ios 26|android 1[4-9]/i.test(title + ' ' + desc)) accent = ', an upward soft light streak rising from the device, fresh optimistic mood';
  if (/очистит|cache|storage|место/i.test(title + ' ' + desc)) accent = ', an empty glass jar and folded microfiber cloth nearby, clean-up mood';

  return `${subject} in an editorial photo scene about: "${title}". ${desc}${accent}`.trim();
}

function buildPrompt(slug, fm, url) {
  const preset = stylePresetFor(slug);
  const scene = buildScene(fm, url);
  return `${scene}. Style: ${preset.style}`;
}

// --- update frontmatter hero field --------------------------------
function ensureHeroInFrontmatter(raw, heroPath, heroAlt) {
  const lines = raw.split('\n');
  const hasHero = lines.some((l) => /^hero\s*:/.test(l));
  const hasHeroAlt = lines.some((l) => /^heroAlt\s*:/.test(l));
  let out = raw;
  if (!hasHero) out += `\nhero: "${heroPath}"`;
  else out = out.replace(/^hero\s*:.*$/m, `hero: "${heroPath}"`);
  if (!hasHeroAlt && heroAlt) out += `\nheroAlt: "${heroAlt.replace(/"/g, '\\"')}"`;
  return out;
}

// --- MAIN ---------------------------------------------------------
async function main() {
  await mkdir(HERO_DIR, { recursive: true });
  const files = await walkMdx(PAGES_DIR);

  const articles = [];
  for (const f of files) {
    const content = await readFile(f, 'utf8');
    const { fm, raw } = parseFrontmatter(content);
    if (!fm.title || !fm.pubDate) continue;
    const url = toUrl(f);
    articles.push({
      file: f,
      url,
      fm,
      raw,
      content,
      pubDate: new Date(fm.pubDate),
      isNews: url.startsWith('/novosti/'),
      fileKey: path.basename(f),
    });
  }

  // тот же сорт, что в index.astro
  articles.sort((a, b) => {
    const dt = b.pubDate.getTime() - a.pubDate.getTime();
    if (dt !== 0) return dt;
    return b.fileKey.localeCompare(a.fileKey);
  });

  const pool = [];
  const seen = new Set();
  for (const a of articles.filter((x) => x.isNews)) {
    if (pool.length >= LIMIT) break;
    pool.push(a);
    seen.add(a.url);
  }
  for (const a of articles) {
    if (pool.length >= LIMIT) break;
    if (seen.has(a.url)) continue;
    pool.push(a);
    seen.add(a.url);
  }

  console.log(`Перегенерирую ${pool.length} hero-картинок:\n`);
  pool.forEach((a, i) => console.log(`  ${i + 1}. ${a.url}  (${a.fm.title.slice(0, 60)}…)`));
  console.log('');

  let totalCost = 0;
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    const slug = path.basename(a.file, '.mdx');
    const outFile = path.join(HERO_DIR, `${slug}.webp`);
    const heroPath = `/images/hero/${slug}.webp`;
    const prompt = buildPrompt(slug, a.fm, a.url);

    console.log(`\n[${i + 1}/${pool.length}] ${slug}`);
    console.log(`  preset: ${stylePresetFor(slug).id}`);
    console.log(`  prompt: ${prompt.slice(0, 160)}…`);

    try {
      const r = await genImage(prompt);
      const buf = await downloadBuffer(r);
      await sharp(buf).resize(1200, 630, { fit: 'cover' }).webp({ quality: 88 }).toFile(outFile);
      if (r.cost) totalCost += Number(r.cost);
      console.log(`  ✓ ${outFile}   cost: $${r.cost ?? '?'}   left: $${r.remaining ?? '?'}`);

      // обновляем frontmatter
      const { raw, body } = parseFrontmatter(a.content);
      const newRaw = ensureHeroInFrontmatter(raw, heroPath, a.fm.title);
      const newContent = `---\n${newRaw}\n---\n${body}`;
      if (newContent !== a.content) {
        await writeFile(a.file, newContent, 'utf8');
        console.log(`  ✎ frontmatter hero updated`);
      }
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
    }
  }

  console.log(`\nГотово. Всего потрачено: ~$${totalCost.toFixed(3)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
