#!/usr/bin/env node
/**
 * AI-hero генератор для страниц казино через Nano-GPT (FLUX 2 Pro).
 *
 * Запуск:
 *   NANO_GPT_API_KEY=sk-nano-... node scripts/generate-casino-ai-heroes.mjs
 *
 * Результаты: public/images/casino/<slug>.webp (1200×630)
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const OUT_DIR = path.join(ROOT, 'public/images/casino');
const PAGES_DIR = path.join(ROOT, 'src/pages/android/casino');
const FONTS_DIR = path.join(ROOT, 'src/assets/fonts');
const TOKEN = process.env.NANO_GPT_API_KEY;
const MODEL = process.env.NANO_GPT_MODEL || 'flux-2-pro';

if (!TOKEN) {
  console.error('NANO_GPT_API_KEY не задан. Запусти: NANO_GPT_API_KEY=sk-nano-... node scripts/generate-casino-ai-heroes.mjs');
  process.exit(1);
}

const TARGETS = [
  {
    slug: 'slotozal',
    file: 'src/pages/android/casino/slotozal.mdx',
    prompt: 'Professional casino app logo design for brand "Slotozal". Glossy 3D golden slot machine reels with lucky 7 symbols, purple and gold gradient background, neon glow effects, premium mobile gaming aesthetic, centered composition, dark luxurious background with subtle sparkles, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'maxslots',
    file: 'src/pages/android/casino/maxslots.mdx',
    prompt: 'Professional casino app logo design for brand "MaxSlots". Vibrant orange and black 3D slot machine with spinning reels showing diamond and cherry symbols, fiery energy effects around it, dark background with orange neon accents, premium mobile gaming look, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'beef-casino',
    file: 'src/pages/android/casino/beef-casino.mdx',
    prompt: 'Professional casino app logo design for brand "Beef Casino". Bold red and black theme, 3D roulette wheel with golden accents spinning dynamically, red neon glow, dark premium background with subtle fire particles, aggressive powerful aesthetic, centered composition, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'legzo-casino',
    file: 'src/pages/android/casino/legzo-casino.mdx',
    prompt: 'Professional casino app logo design for brand "Legzo". Cool cyan and dark blue gradient, 3D crystal-like dice and poker chips floating in space, ice-blue neon glow effects, futuristic sleek design, dark background with blue light streaks, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'leebet',
    file: 'src/pages/android/casino/leebet.mdx',
    prompt: 'Professional casino and sportsbook app logo design for brand "Leebet". Green and gold theme, 3D football and casino chip combined in one dynamic composition, emerald green neon glow, dark background with golden sparkles, sports betting meets casino aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'r7-casino',
    file: 'src/pages/android/casino/r7-casino.mdx',
    prompt: 'Professional casino app logo design for brand "R7". Golden amber and dark brown luxury theme, 3D golden number 7 with casino cards (ace of spades) fanning behind it, warm golden glow, premium VIP aesthetic, dark velvet background with gold dust particles, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'starda-casino',
    file: 'src/pages/android/casino/starda-casino.mdx',
    prompt: 'Professional casino app logo design for brand "Starda". Deep purple and violet space theme, 3D glowing star with casino elements (chips, cards) orbiting around it like planets, cosmic nebula background, purple and pink neon glow, magical premium aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'kometa-casino',
    file: 'src/pages/android/casino/kometa-casino.mdx',
    prompt: 'Professional casino app logo design for brand "Kometa". Blue and white space theme, 3D comet with a glowing trail made of golden coins and casino chips, deep space dark background with blue nebula, dynamic motion feel, premium cosmic aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: '7k-casino',
    file: 'src/pages/android/casino/7k-casino.mdx',
    prompt: 'Professional casino app logo design for brand "7K". Bold red and gold classic casino theme, 3D lucky number 7 made of gold with ruby gemstones embedded, classic slot machine cherries nearby, red velvet and gold luxury background, retro-premium aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'vavada',
    file: 'src/pages/android/casino/vavada.mdx',
    prompt: 'Professional casino app logo design for brand "Vavada". Orange and dark theme, 3D golden crown with casino roulette wheel beneath it, warm orange and amber neon glow, dark premium background with floating golden coins, royal VIP aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'vulkan',
    file: 'src/pages/android/casino/vulkan.mdx',
    prompt: 'Professional casino app logo design for brand "Vulkan". Red and black volcanic theme, 3D erupting volcano with lava made of golden coins and casino chips flowing out, dramatic red and orange glow, dark smoky background, powerful explosive aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'pharaon-casino',
    file: 'src/pages/android/casino/pharaon-casino.mdx',
    prompt: 'Professional casino app logo design for brand "Pharaon". Egyptian gold and dark blue theme, 3D golden pharaoh mask with casino elements (scarab beetles made of emeralds, golden coins), ancient Egyptian pyramid silhouette in background, warm gold neon glow, luxurious mystical aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
  {
    slug: 'vodka-casino',
    file: 'src/pages/android/casino/vodka-casino.mdx',
    prompt: 'Professional casino app logo design for brand "Vodka Casino". Ice blue and silver theme, 3D frozen crystal casino chip with ice shards and frost effects, cool cyan and white neon glow, dark background with snowflake particles, premium cold luxury aesthetic, centered, no text, no letters, no watermark, high detail, 4k quality',
  },
];

// --- Nano-GPT helpers --------------------------------------------------

async function runNano(prompt) {
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
  if (!item) throw new Error('Nano-GPT: пустой data');

  if (item.url) return { kind: 'url', value: item.url, cost: data.cost, remaining: data.remainingBalance };
  if (item.b64_json) return { kind: 'b64', value: item.b64_json, cost: data.cost, remaining: data.remainingBalance };
  throw new Error('Nano-GPT: нет url или b64_json в ответе');
}

async function fetchBuffer(result) {
  if (result.kind === 'url') {
    const r = await fetch(result.value);
    if (!r.ok) throw new Error(`Download ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return Buffer.from(result.value, 'base64');
}

async function saveAsHero(buf, destPath) {
  await sharp(buf)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .webp({ quality: 88 })
    .toFile(destPath);
}

// --- frontmatter update ------------------------------------------------

async function setHeroInFrontmatter(filePath, heroUrl, heroAlt) {
  const raw = await readFile(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return;
  let fm = m[1];

  const setOrReplace = (key, value) => {
    const re = new RegExp(`^${key}:.*$`, 'm');
    const line = `${key}: "${value.replace(/"/g, '\\"')}"`;
    if (re.test(fm)) fm = fm.replace(re, line);
    else fm = fm + '\n' + line;
  };

  setOrReplace('hero', heroUrl);
  setOrReplace('heroAlt', heroAlt);

  const updated = raw.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`);
  await writeFile(filePath, updated);
}

// --- main --------------------------------------------------------------

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Casino AI-hero: ${TARGETS.length} брендов через Nano-GPT (${MODEL})…\n`);

  let i = 0;
  let totalCost = 0;
  let lastBalance = null;
  const force = process.argv.includes('--force');

  for (const t of TARGETS) {
    const outFile = path.join(OUT_DIR, `${t.slug}.webp`);
    const filePath = path.join(ROOT, t.file);
    i++;

    const exists = await access(outFile).then(() => true).catch(() => false);
    if (exists && !force) {
      console.log(`[${i}/${TARGETS.length}] skip (exists): ${t.slug}`);
      continue;
    }

    try {
      console.log(`[${i}/${TARGETS.length}] ${t.slug}`);
      const res = await runNano(t.prompt);
      if (typeof res.cost === 'number') totalCost += res.cost;
      if (typeof res.remaining === 'number') lastBalance = res.remaining;
      console.log(`  ↓ cost=$${res.cost ?? '?'}`);

      const buf = await fetchBuffer(res);
      await saveAsHero(buf, outFile);

      // Обновляем frontmatter — меняем hero на .webp
      const heroUrl = `/images/casino/${t.slug}.webp`;
      const src = await readFile(filePath, 'utf8');
      const titleMatch = src.match(/^(?:h1|title):\s*"([^"]+)"/m);
      const heroAlt = titleMatch ? titleMatch[1] : `${t.slug} казино`;

      await setHeroInFrontmatter(filePath, heroUrl, heroAlt);
      console.log(`  ✓ ${t.slug}.webp (1200×630) + frontmatter updated\n`);
    } catch (e) {
      console.error(`  ✗ ${t.slug}: ${e.message}\n`);
    }
  }

  console.log(`\nГотово. Потрачено ~$${totalCost.toFixed(3)}${lastBalance != null ? `, остаток $${lastBalance.toFixed(2)}` : ''}.`);
  console.log('Коммить public/images/casino/ и пуш.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
