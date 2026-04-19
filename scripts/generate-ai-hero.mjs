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
//
// Вместо одного «abstract 3D magazine cover» стиля — 4 фотореалистичных
// пресета, которые детерминированно ротируются по slug. Это даёт:
//   - разнообразие (соседние карточки на главной не сливаются в одну «AI-шную» стену)
//   - ощущение реального тех-издания (Android Authority / 9to5Mac) вместо абстракта
//
// Каждый промпт в TARGETS теперь описывает СЮЖЕТ сцены (что происходит, какие
// объекты в кадре, какая палитра), а техническая часть — пресет — добавляется
// ниже функцией buildPrompt().

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

// Простой стабильный хэш по строке — одна и та же slug всегда даёт один пресет,
// но по всему набору slug'ов пресеты распределяются равномерно.
function stylePresetFor(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = ((h << 5) - h + slug.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % STYLE_PRESETS.length;
  return STYLE_PRESETS[idx];
}

function buildPrompt(slug, scene) {
  const preset = stylePresetFor(slug);
  return `${scene}. Style: ${preset.style}`;
}

// Вспомогательный шорткат для описания сцены — вытаскивает только семантическую
// часть старых промптов (без «Abstract 3D illustration of» / ${STYLE}).
const s = (scene) => scene;

// В каждом таргете `scene` — это сюжет кадра (что снимаем). Стиль (освещение,
// оптика, палитра, композиция) добавляется автоматически через stylePresetFor(slug).
const RAW_TARGETS = [
  // === OBZORY =======================================================
  { file: 'src/pages/obzory/luchshie-messenzhery-2026.mdx', slug: 'luchshie-messenzhery-2026',
    scene: s('close-up of a smartphone screen showing multiple colorful chat bubbles in a messenger interface, modern phone in someone hands, purple and violet ambient light, soft bokeh') },
  { file: 'src/pages/obzory/whatsapp-vs-telegram.mdx', slug: 'whatsapp-vs-telegram',
    scene: s('two identical modern smartphones side by side on a desk, each screen glowing with a different accent color (one green, one cyan-blue), clean neutral background, symmetrical composition') },
  { file: 'src/pages/obzory/luchshie-vpn-iphone.mdx', slug: 'luchshie-vpn-iphone',
    scene: s('a smartphone lying on a dark wooden desk showing a padlock icon on screen, soft blue ambient light, a pair of simple headphones nearby, privacy and security mood') },
  { file: 'src/pages/obzory/luchshie-vpn-android.mdx', slug: 'luchshie-vpn-android',
    scene: s('a modern android-style smartphone on a concrete surface, green-tinted reflections on the glass back, tiny network points of light around it, calm atmospheric mood') },
  { file: 'src/pages/obzory/luchshie-antivirusy-android.mdx', slug: 'luchshie-antivirusy-android',
    scene: s('smartphone on a dark desk with a subtle warning glow around the screen, security scan visualized as faint green scan line, moody dramatic lighting') },
  { file: 'src/pages/obzory/luchshie-brauzery-iphone.mdx', slug: 'luchshie-brauzery-iphone',
    scene: s('smartphone on a tidy desk showing a generic browser-like window on screen, small notebook and a pen nearby, calm workspace, soft window light') },
  { file: 'src/pages/obzory/luchshie-prilozheniya-dlya-chteniya.mdx', slug: 'luchshie-prilozheniya-dlya-chteniya',
    scene: s('smartphone resting on an open paperback book, warm reading lamp light, a cup of tea nearby, cozy evening mood, beige and brown palette') },
  { file: 'src/pages/obzory/luchshie-prilozheniya-dlya-zametok.mdx', slug: 'luchshie-prilozheniya-dlya-zametok',
    scene: s('smartphone on a light wooden desk surrounded by a few pastel sticky notes and a pen, tidy top-down flat-lay composition, soft morning daylight') },
  { file: 'src/pages/obzory/menedzhery-parolei.mdx', slug: 'menedzhery-parolei',
    scene: s('smartphone on a dark desk with a small brass key placed next to it, single warm spotlight on the key, minimal composition, security and trust mood') },
  { file: 'src/pages/obzory/alternativy-itunes.mdx', slug: 'alternativy-itunes',
    scene: s('smartphone on a desk next to a pair of premium over-ear headphones and a small record vinyl, warm magenta and violet ambient lighting, music editorial mood') },

  // === SOVETY =======================================================
  { file: 'src/pages/sovety/kak-sehkonomit-batareyu-iphone.mdx', slug: 'kak-sehkonomit-batareyu-iphone',
    scene: s('smartphone plugged into a minimalist charging cable on a wooden desk, warm orange sunset light through a window, calm lifestyle mood') },
  { file: 'src/pages/sovety/kak-umenshit-trafik-na-telefone.mdx', slug: 'kak-umenshit-trafik-na-telefone',
    scene: s('smartphone held in a hand in a cafe, slight motion blur in the background suggesting mobile usage, cool teal and navy ambient tones') },
  { file: 'src/pages/sovety/kak-uskorit-android.mdx', slug: 'kak-uskorit-android',
    scene: s('modern smartphone floating slightly above a concrete surface with a soft motion-blur streak behind it, dynamic composition, cool green and lime rim light') },
  { file: 'src/pages/sovety/osvobodit-mesto-na-iphone.mdx', slug: 'osvobodit-mesto-na-iphone',
    scene: s('smartphone on a clean light desk surrounded by a few neatly organized small objects (keys, notebook, mug), tidy minimalist flat-lay, airy mood') },
  { file: 'src/pages/sovety/upravlyat-podpiskami-app-store.mdx', slug: 'upravlyat-podpiskami-app-store',
    scene: s('smartphone on a desk next to a stack of neatly arranged blank credit-card-sized cards and a small plant, warm coral and pink ambient tones, personal finance mood') },

  // === BEZOPASNOST ==================================================
  { file: 'src/pages/bezopasnost/bezopasno-skachat-apk-android.mdx', slug: 'bezopasno-skachat-apk-android',
    scene: s('smartphone on a dark desk with a small closed cardboard parcel next to it, single soft green rim light, trust and delivery mood') },
  { file: 'src/pages/bezopasnost/chto-delat-esli-dannye-uteklii.mdx', slug: 'chto-delat-esli-dannye-uteklii',
    scene: s('smartphone on a very dark surface with a single red warning light glowing faintly on the screen, moody dramatic low-key lighting, tension mood, no text') },
  { file: 'src/pages/bezopasnost/kak-nastroit-dvuhfaktornuyu-autentifikaciyu.mdx', slug: 'kak-nastroit-dvuhfaktornuyu-autentifikaciyu',
    scene: s('smartphone on a dark desk with two small brass keys lying next to it in a symmetrical pair, single focused warm light, premium security mood') },
  { file: 'src/pages/bezopasnost/kak-proverit-prilozhenie-na-virus.mdx', slug: 'kak-proverit-prilozhenie-na-virus',
    scene: s('smartphone under a magnifying glass on a wooden desk, small scan line of light across the screen, editorial detective mood, neutral palette with a cool blue accent') },

  // === ANDROID / kak-sdelat =========================================
  { file: 'src/pages/android/kak-sdelat/obnovit-android.mdx', slug: 'android-obnovit-android',
    scene: s('modern android-style smartphone on a clean desk, a subtle upward light streak rising from the screen, fresh and optimistic mood, green rim light accent') },
  { file: 'src/pages/android/kak-sdelat/ochistit-kesh-android.mdx', slug: 'android-ochistit-kesh-android',
    scene: s('smartphone on a tidy workspace with a small empty glass jar nearby, crumbs of paper swept aside, symbolic clean-up mood, bright and airy') },
  { file: 'src/pages/android/kak-sdelat/perenos-dannyh-android.mdx', slug: 'android-perenos-dannyh-android',
    scene: s('two smartphones side by side on a light desk connected by a short cable, symmetrical top-down composition, clean and practical mood') },
  { file: 'src/pages/android/kak-sdelat/sbros-nastroek-android.mdx', slug: 'android-sbros-nastroek-android',
    scene: s('smartphone resting on a fresh white sheet of paper on a desk, tidy minimal flat-lay, soft daylight, blank-slate new-start mood') },
  { file: 'src/pages/android/kak-sdelat/sinhronizaciya-android-pc.mdx', slug: 'android-sinhronizaciya-android-pc',
    scene: s('smartphone lying next to a modern laptop on a clean desk, a short USB-C cable between them, soft cool daylight, practical workspace mood') },
  { file: 'src/pages/android/kak-sdelat/skachat-prilozhenie-ne-iz-google-play.mdx', slug: 'android-skachat-prilozhenie-ne-iz-google-play',
    scene: s('smartphone held in a hand over a wooden desk with a few generic app-icon-shaped paper cards laid out, editorial choice mood, warm side light') },
  { file: 'src/pages/android/kak-sdelat/ustanovit-apk-android.mdx', slug: 'android-ustanovit-apk-android',
    scene: s('smartphone on a desk next to a small opened cardboard box with soft light spilling out of it, tidy composition, symbolic installation mood') },
  { file: 'src/pages/android/kak-sdelat/zamena-ehkrana-smartfona.mdx', slug: 'android-zamena-ehkrana-smartfona',
    scene: s('close-up of a pristine new smartphone on a repair mat with a small screwdriver next to it, clean workshop vibe, soft even lighting, precise and professional mood') },

  // === IOS / kak-sdelat =============================================
  { file: 'src/pages/ios/kak-sdelat/perenesti-dannyie-na-novyi-iphone.mdx', slug: 'ios-perenesti-dannyie-na-novyi-iphone',
    scene: s('two modern iphones on a clean desk placed close to each other, their screens facing up, cool blue and silver ambient tones, fresh upgrade mood') },
  { file: 'src/pages/ios/kak-sdelat/obnovit-ios.mdx', slug: 'ios-obnovit-ios',
    scene: s('modern iphone on a light desk with a subtle upward light streak rising above the screen, cool blue rim light accent, fresh and optimistic mood') },
  { file: 'src/pages/ios/kak-sdelat/ochistit-kesh-iphone.mdx', slug: 'ios-ochistit-kesh-iphone',
    scene: s('iphone on a bright clean desk with a small empty glass jar and a folded microfiber cloth nearby, airy minimal flat-lay, clean-up mood') },
];

const TARGETS = RAW_TARGETS.map((t) => ({
  file: t.file,
  slug: t.slug,
  prompt: buildPrompt(t.slug, t.scene),
}));

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
