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

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
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
  // === OBZORY (10) ==================================================
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

  // === SOVETY (5) ==================================================
  {
    file: 'src/pages/sovety/kak-sehkonomit-batareyu-iphone.mdx',
    slug: 'kak-sehkonomit-batareyu-iphone',
    prompt: `Abstract 3D illustration of a translucent glass battery charging, warm amber to emerald green gradient, energy particles flowing upward, elegant studio composition, ${STYLE}`,
  },
  {
    file: 'src/pages/sovety/kak-umenshit-trafik-na-telefone.mdx',
    slug: 'kak-umenshit-trafik-na-telefone',
    prompt: `Abstract 3D illustration of flowing data streams being compressed through a narrow glass funnel, cool teal and deep navy gradient, bandwidth optimization concept, ${STYLE}`,
  },
  {
    file: 'src/pages/sovety/kak-uskorit-android.mdx',
    slug: 'kak-uskorit-android',
    prompt: `Abstract 3D illustration of a translucent glass smartphone with speed lines and motion trails streaming past, emerald green and lime gradient, dynamic acceleration, ${STYLE}`,
  },
  {
    file: 'src/pages/sovety/osvobodit-mesto-na-iphone.mdx',
    slug: 'osvobodit-mesto-na-iphone',
    prompt: `Abstract 3D illustration of a translucent glass smartphone with files and folders dissolving into light particles, soft sky blue gradient, decluttering concept, ${STYLE}`,
  },
  {
    file: 'src/pages/sovety/upravlyat-podpiskami-app-store.mdx',
    slug: 'upravlyat-podpiskami-app-store',
    prompt: `Abstract 3D illustration of stacked translucent subscription cards with circular renewal arrows, coral orange to soft pink gradient, financial management concept, ${STYLE}`,
  },

  // === BEZOPASNOST (4) =============================================
  {
    file: 'src/pages/bezopasnost/bezopasno-skachat-apk-android.mdx',
    slug: 'bezopasno-skachat-apk-android',
    prompt: `Abstract 3D illustration of a glass package box with a translucent green shield overlay and download arrow, teal and emerald gradient, secure installation concept, ${STYLE}`,
  },
  {
    file: 'src/pages/bezopasnost/chto-delat-esli-dannye-uteklii.mdx',
    slug: 'chto-delat-esli-dannye-uteklii',
    prompt: `Abstract 3D illustration of a cracked translucent glass shield with red warning light leaking through fractures, dramatic crimson and deep charcoal gradient, data breach concept, ${STYLE}`,
  },
  {
    file: 'src/pages/bezopasnost/kak-nastroit-dvuhfaktornuyu-autentifikaciyu.mdx',
    slug: 'kak-nastroit-dvuhfaktornuyu-autentifikaciyu',
    prompt: `Abstract 3D illustration of two glowing golden keys interlocking above a glass lock icon, deep navy blue and gold gradient, authentication security concept, ${STYLE}`,
  },
  {
    file: 'src/pages/bezopasnost/kak-proverit-prilozhenie-na-virus.mdx',
    slug: 'kak-proverit-prilozhenie-na-virus',
    prompt: `Abstract 3D illustration of a glowing magnifying glass scanning floating app icons, red virus-like particles being neutralized by blue light, cool blue to crimson gradient, ${STYLE}`,
  },

  // === ANDROID / kak-sdelat (8) ====================================
  {
    file: 'src/pages/android/kak-sdelat/obnovit-android.mdx',
    slug: 'android-obnovit-android',
    prompt: `Abstract 3D illustration of an upward progress arrow emerging from a translucent smartphone silhouette, Android emerald green gradient, software update concept, minimalist composition, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/ochistit-kesh-android.mdx',
    slug: 'android-ochistit-kesh-android',
    prompt: `Abstract 3D illustration of a translucent glass trash can with digital data particles dissolving inside, emerald green gradient, storage clearing concept, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/perenos-dannyh-android.mdx',
    slug: 'android-perenos-dannyh-android',
    prompt: `Abstract 3D illustration of two translucent glass smartphones exchanging floating data packets between them, emerald green and teal gradient, smooth data transfer, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/sbros-nastroek-android.mdx',
    slug: 'android-sbros-nastroek-android',
    prompt: `Abstract 3D illustration of a circular refresh arrow wrapping around a translucent smartphone, emerald green gradient, fresh start factory reset concept, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/sinhronizaciya-android-pc.mdx',
    slug: 'android-sinhronizaciya-android-pc',
    prompt: `Abstract 3D illustration of a glass smartphone and laptop linked by synchronizing circular arrow loops, soft emerald green and blue gradient, cross-device sync concept, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/skachat-prilozhenie-ne-iz-google-play.mdx',
    slug: 'android-skachat-prilozhenie-ne-iz-google-play',
    prompt: `Abstract 3D illustration of a glass app icon floating beside multiple alternative sources, download arrows, teal and amber gradient, alternative app stores concept, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/ustanovit-apk-android.mdx',
    slug: 'android-ustanovit-apk-android',
    prompt: `Abstract 3D illustration of a glass package box dissolving into emerald green light particles, installation progress concept, clean gradient background, ${STYLE}`,
  },
  {
    file: 'src/pages/android/kak-sdelat/zamena-ehkrana-smartfona.mdx',
    slug: 'android-zamena-ehkrana-smartfona',
    prompt: `Abstract 3D illustration of a translucent smartphone with a pristine glass panel replacing a cracked one, soft silver and cool blue gradient, repair concept, ${STYLE}`,
  },

  // === IOS / kak-sdelat (3 популярных) =============================
  {
    file: 'src/pages/ios/kak-sdelat/perenesti-dannyie-na-novyi-iphone.mdx',
    slug: 'ios-perenesti-dannyie-na-novyi-iphone',
    prompt: `Abstract 3D illustration of two floating translucent iPhone shapes connected by a flowing light bridge, data packets traveling between them, soft silver and Apple blue gradient, ${STYLE}`,
  },
  {
    file: 'src/pages/ios/kak-sdelat/obnovit-ios.mdx',
    slug: 'ios-obnovit-ios',
    prompt: `Abstract 3D illustration of an upward progress arrow emerging from a translucent iPhone silhouette, Apple blue gradient, iOS software update concept, premium minimalist composition, ${STYLE}`,
  },
  {
    file: 'src/pages/ios/kak-sdelat/ochistit-kesh-iphone.mdx',
    slug: 'ios-ochistit-kesh-iphone',
    prompt: `Abstract 3D illustration of a translucent glass trash can with digital data particles dissolving into light, soft sky blue gradient, iPhone cache clearing concept, ${STYLE}`,
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

  const force = process.argv.includes('--force');

  for (const t of TARGETS) {
    const filePath = path.join(ROOT, t.file);
    const outFile = path.join(HERO_DIR, `${t.slug}.webp`);
    i++;
    const exists = await access(outFile).then(() => true).catch(() => false);
    if (exists && !force) {
      console.log(`[${i}/${TARGETS.length}] skip (exists): ${t.slug}`);
      continue;
    }
    try {
      console.log(`\n[${i}/${TARGETS.length}] ${t.slug}`);
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
