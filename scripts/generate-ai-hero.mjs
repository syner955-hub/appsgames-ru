#!/usr/bin/env node
/**
 * AI-hero генератор для топ-обзорных статей через Nano-GPT.
 * Модель: FLUX 2 Pro (~$0.04 за картинку).
 *
 * Запуск:
 *   NANO_GPT_API_KEY=sk-nano-... npm run og:ai
 *
 * Результаты кладутся в public/images/hero/<slug>.webp (1200x630)
 * и прописываются в frontmatter соответствующего MDX-файла как
 * `hero: /images/hero/<slug>.webp`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const HERO_DIR = path.join(ROOT, 'public/images/hero');
const TOKEN = process.env.NANO_GPT_API_KEY;
const MODEL = process.env.NANO_GPT_MODEL || 'flux-2-pro';

if (!TOKEN) {
  console.error('NANO_GPT_API_KEY не задан. Запусти: NANO_GPT_API_KEY=sk-nano-... npm run og:ai');
  process.exit(1);
}

// --- промпты -----------------------------------------------------------

const STYLE =
  'editorial magazine cover illustration, minimalist abstract 3D composition, ' +
  'soft volumetric lighting, clean studio background, depth of field, ' +
  'professional high-end photography, cinematic color grading, no text, no logo, no letters, ' +
  'octane render, 8k, photorealistic';

const TARGETS = [
  {
    file: 'src/pages/obzory/luchshie-messenzhery-2026.mdx',
    slug: 'luchshie-messenzhery-2026',
    prompt: `Abstract 3D illustration of floating translucent chat bubbles in purple violet gradient, connected by soft light trails, glass morphism style, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/whatsapp-vs-telegram.mdx',
    slug: 'whatsapp-vs-telegram',
    prompt: `Two abstract 3D chat bubbles facing each other, one green and one cyan-blue, glass morphism, neutral light background, balanced composition, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/luchshie-vpn-iphone.mdx',
    slug: 'luchshie-vpn-iphone',
    prompt: `Abstract 3D composition of a glowing translucent shield over network nodes, cold blue and cyan gradient, encrypted connections, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/luchshie-vpn-android.mdx',
    slug: 'luchshie-vpn-android',
    prompt: `Abstract 3D illustration of a glass shield protecting flowing data streams, emerald green and teal gradient, glowing particles, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/luchshie-antivirusy-android.mdx',
    slug: 'luchshie-antivirusy-android',
    prompt: `Abstract 3D emerald green hexagonal shield blocking red virus-like particles, glossy materials, dynamic composition, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/luchshie-brauzery-iphone.mdx',
    slug: 'luchshie-brauzery-iphone',
    prompt: `Abstract 3D illustration of multiple glass browser window frames floating in space, blue purple gradient, soft reflections, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/luchshie-prilozheniya-dlya-chteniya.mdx',
    slug: 'luchshie-prilozheniya-dlya-chteniya',
    prompt: `Abstract 3D illustration of floating translucent book pages curving gracefully, warm paper beige and soft purple tones, gentle lighting, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/luchshie-prilozheniya-dlya-zametok.mdx',
    slug: 'luchshie-prilozheniya-dlya-zametok',
    prompt: `Abstract 3D floating sticky notes and paper sheets layered in space, soft pastel yellow and cream palette, gentle shadows, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/menedzhery-parolei.mdx',
    slug: 'menedzhery-parolei',
    prompt: `Abstract 3D illustration of a glowing golden key floating above connected glass lock icons, deep blue gradient, premium security, ${STYLE}`,
  },
  {
    file: 'src/pages/obzory/alternativy-itunes.mdx',
    slug: 'alternativy-itunes',
    prompt: `Abstract 3D illustration of floating music notes and waveforms in space, gradient from magenta to violet, glossy glass materials, ${STYLE}`,
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
  // 1024×1024 → 1200×630 (cover, центровка, webp q85)
  await sharp(buf)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .webp({ quality: 85 })
    .toFile(destPath);
}

// --- frontmatter injection ---------------------------------------------

async function setHeroInFrontmatter(filePath, heroUrl, heroAlt) {
  const raw = await readFile(filePath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) {
    console.warn(`  пропуск: нет frontmatter в ${filePath}`);
    return;
  }
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
  await mkdir(HERO_DIR, { recursive: true });
  console.log(`AI-hero: ${TARGETS.length} статей через Nano-GPT (${MODEL})…`);

  let i = 0;
  let totalCost = 0;
  let lastBalance = null;

  for (const t of TARGETS) {
    const filePath = path.join(ROOT, t.file);
    const outFile = path.join(HERO_DIR, `${t.slug}.webp`);
    try {
      console.log(`\n[${++i}/${TARGETS.length}] ${t.slug}`);
      const res = await runNano(t.prompt);
      if (typeof res.cost === 'number') totalCost += res.cost;
      if (typeof res.remaining === 'number') lastBalance = res.remaining;
      console.log(`  ↓ ${res.kind === 'url' ? res.value.slice(0, 60) + '…' : '[b64 inline]'}  cost=$${res.cost ?? '?'}`);

      const buf = await fetchBuffer(res);
      await saveAsHero(buf, outFile);

      const src = await readFile(filePath, 'utf8');
      const titleMatch = src.match(/^(?:h1|title):\s*"([^"]+)"/m);
      const heroAlt = titleMatch ? titleMatch[1] : t.slug;

      await setHeroInFrontmatter(filePath, `/images/hero/${t.slug}.webp`, heroAlt);
      console.log(`  ✓ public/images/hero/${t.slug}.webp (1200×630) + frontmatter`);
    } catch (e) {
      console.error(`  ✗ ${t.slug}: ${e.message}`);
    }
  }
  console.log(`\nГотово. Потрачено ~$${totalCost.toFixed(3)}${lastBalance != null ? `, остаток $${lastBalance.toFixed(2)}` : ''}.`);
  console.log('Не забудь `npm run build` и коммит public/images/hero/.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
