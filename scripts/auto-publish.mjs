#!/usr/bin/env node
/**
 * Автопубликация новостей.
 *
 * Pipeline:
 *   1. Читает несколько RSS-фидов (RU и EN про iOS/Android/приложения)
 *   2. Фильтрует уже опубликованное (по файлу data/published.json)
 *   3. Берёт топ-N самых свежих релевантных новостей
 *   4. GPT-5 (через Nano-GPT) пишет уникальную русскоязычную статью
 *   5. FLUX 2 Pro генерит hero-картинку
 *   6. Создаёт MDX в src/pages/novosti/YYYY-MM-DD-<slug>.mdx
 *   7. Обновляет data/published.json
 *
 * Запуск:
 *   NANO_GPT_API_KEY=sk-nano-... node scripts/auto-publish.mjs
 *   (или npm run publish)
 *
 * ENV:
 *   NANO_GPT_API_KEY — обязательно
 *   MAX_PER_RUN — сколько статей сгенерить (default 3)
 *   LLM_MODEL — модель для текста (default 'gpt-5')
 *   IMAGE_MODEL — модель для hero (default 'flux-2-pro')
 *   DRY_RUN=1 — не писать файлы, только логировать
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const NEWS_DIR = path.join(ROOT, 'src/pages/novosti');
const HERO_DIR = path.join(ROOT, 'public/images/hero');
const STATE_FILE = path.join(ROOT, 'data/published.json');

const TOKEN = process.env.NANO_GPT_API_KEY;
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN ?? 3);
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-5';
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'flux-2-pro';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!TOKEN) {
  console.error('NANO_GPT_API_KEY не задан');
  process.exit(1);
}

// --- источники -----------------------------------------------------------

// Источники — только пользовательские темы (не dev-блоги, не исходный код).
// AppsGames.ru пишет для обычных владельцев iPhone/Android, а не для разработчиков.
const FEEDS = [
  // EN — крупные издания про устройства и приложения для пользователей
  { url: 'https://9to5mac.com/feed/', lang: 'en', cat: 'iOS' },
  { url: 'https://9to5google.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.androidauthority.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.macrumors.com/macrumors.xml', lang: 'en', cat: 'iOS' },
  { url: 'https://www.androidpolice.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.phonearena.com/feed', lang: 'en', cat: 'Приложения' },
  // RU
  { url: 'https://appleinsider.ru/feed', lang: 'ru', cat: 'iOS' },
  { url: 'https://www.iphones.ru/rss', lang: 'ru', cat: 'iOS' },
  { url: 'https://4pda.to/feed/', lang: 'ru', cat: 'Приложения' },
  { url: 'https://www.ixbt.com/export/mobile.rss', lang: 'ru', cat: 'Приложения' },
];

// Ключевые слова, после которых кандидата отбрасываем (не наша тематика).
const BLOCKLIST_KEYWORDS = [
  // Разработка / код
  'swiftui','uikit','kotlin dsl','jetpack compose','xcode','android studio',
  'flutter','react native','framework','sdk','ci/cd','devops','backend',
  'coroutine','архитектур','рефакторинг','open source','исходн',
  // Другие темы, не относящиеся к мобильным приложениям
  'криптовалют','crypto','nft','блокчейн','blockchain','биткоин','bitcoin',
  'политик','выборы','коронавирус','covid',
  // Железо без приложений
  'тв-приставк','умн','колонк','наушник','смарт-час', // пропускаем обзоры железок без софта
];

// Ключевые слова, ПОВЫШАЮЩИЕ приоритет (наша ЦА точно кликнет)
const BOOSTLIST_KEYWORDS = [
  'ios','android','iphone','ipad','приложени','app store','google play',
  'whatsapp','telegram','youtube','instagram','tiktok','spotify','netflix',
  'vpn','антивирус','безопасност','privacy','privacy','2fa','пароль',
  'обновлени','update','release','вышел','вышло','релиз','выпустил',
  'россия','россий','российск','ркн','банк','sberbank','сбербанк','тинькофф',
  'альтернатива','заменить','бесплатн','как','инструкция',
];

// --- утилиты -------------------------------------------------------------

function slugify(text) {
  const translit = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'j',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
    х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
  };
  return text
    .toLowerCase()
    .split('')
    .map((c) => translit[c] ?? c)
    .join('')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { published: [] };
  }
}

async function saveState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  // Храним последние 500 записей, чтобы файл не пух
  state.published = state.published.slice(-500);
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// --- RSS ------------------------------------------------------------------

const parser = new Parser({ timeout: 20000 });

async function fetchAllFeeds() {
  const results = [];
  for (const f of FEEDS) {
    try {
      const feed = await parser.parseURL(f.url);
      for (const item of feed.items || []) {
        results.push({
          source: feed.title || f.url,
          sourceUrl: f.url,
          lang: f.lang,
          category: f.cat,
          title: stripHtml(item.title || '').slice(0, 250),
          link: item.link,
          isoDate: item.isoDate || item.pubDate || new Date().toISOString(),
          summary: stripHtml(item.contentSnippet || item.content || item.summary || '').slice(0, 1200),
        });
      }
      console.log(`  [RSS] ${f.url} — ${feed.items?.length ?? 0} items`);
    } catch (e) {
      console.warn(`  [RSS] ${f.url} — error: ${e.message}`);
    }
  }
  return results;
}

function scoreRelevance(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  // Блоклист — сразу отказ
  for (const kw of BLOCKLIST_KEYWORDS) {
    if (text.includes(kw)) return -1;
  }
  // Буст по ключевикам
  let score = 0;
  for (const kw of BOOSTLIST_KEYWORDS) {
    if (text.includes(kw)) score += 1;
  }
  return score;
}

function pickFresh(items, state, limit) {
  const published = new Set(state.published.map((p) => p.link));
  const now = Date.now();
  const cutoff = now - 72 * 3600 * 1000; // 72 часа окно

  const scored = items
    .filter((i) => i.link && !published.has(i.link))
    .filter((i) => new Date(i.isoDate).getTime() > cutoff)
    .filter((i) => i.title && i.title.length > 20)
    .map((i) => ({ ...i, _score: scoreRelevance(i) }))
    .filter((i) => i._score >= 0); // без блоклистных

  // Сортируем: по score DESC, потом по дате DESC
  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
  });

  // Разнообразие: не более 1 подряд из одного источника для первых N; и не более 1 на категорию
  const picked = [];
  const countBySource = new Map();
  const countByCat = new Map();
  for (const c of scored) {
    const s = countBySource.get(c.sourceUrl) || 0;
    const k = countByCat.get(c.category) || 0;
    if (s >= 1) continue;
    if (k >= 2) continue;
    picked.push(c);
    countBySource.set(c.sourceUrl, s + 1);
    countByCat.set(c.category, k + 1);
    if (picked.length >= limit) break;
  }
  return picked;
}

// --- Nano-GPT API --------------------------------------------------------

async function callLLM(messages, { responseFormat } = {}) {
  const body = {
    model: LLM_MODEL,
    messages,
  };
  if (responseFormat === 'json') body.response_format = { type: 'json_object' };

  const res = await fetch('https://nano-gpt.com/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function genImage(prompt) {
  const res = await fetch('https://nano-gpt.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }),
  });
  if (!res.ok) throw new Error(`Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const item = data?.data?.[0];
  if (item?.url) {
    const r = await fetch(item.url);
    return Buffer.from(await r.arrayBuffer());
  }
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  throw new Error('Image: нет url/b64 в ответе');
}

// --- генерация статьи ----------------------------------------------------

const WRITER_SYSTEM = `Ты редактор русскоязычного блога о мобильных приложениях AppsGames.ru для iOS и Android.
Пишешь новостные материалы для русскоязычной аудитории в разговорном, но экспертном тоне.

СТРОГИЕ ПРАВИЛА:
- Пиши ТОЛЬКО на русском языке.
- НЕ копируй формулировки источника дословно — переписывай своими словами.
- Добавляй контекст: что это значит для пользователя в России, работает ли в РФ, есть ли альтернативы.
- Обязательно укажи источник в конце отдельным абзацем.
- Избегай clickbait-заголовков и канцелярита ("качественный", "индивидуальный подход", "лидер рынка").
- Объём тела статьи: 1500-2500 символов (~250-400 слов).
- Структура: TL;DR (2-3 предложения) → основная часть (2-4 абзаца) → что это значит для тебя → источник.

ФОРМАТ ОТВЕТА: только валидный JSON, без markdown обёртки.`;

function buildWriterPrompt(item) {
  return `Напиши новость на основе этого источника.

ИСТОЧНИК:
- Заголовок: ${item.title}
- Описание: ${item.summary}
- Ссылка: ${item.link}
- Издание: ${item.source}
- Язык источника: ${item.lang === 'ru' ? 'русский' : 'английский (нужно переводить и адаптировать)'}
- Тематика: ${item.category}

ТРЕБОВАНИЯ К JSON:
{
  "title": "Короткий заголовок на русском (60-90 символов, без кавычек и emoji)",
  "h1": "Заголовок h1 (может совпадать с title или быть немного длиннее, 60-110 символов)",
  "description": "SEO-описание для meta-тега (140-180 символов, выжимка сути)",
  "slug": "url-slug-only-latin-letters-and-hyphens",
  "tldrPoints": ["Пункт 1 TL;DR (1 предложение)", "Пункт 2", "Пункт 3"],
  "body": "Основной текст в markdown (1500-2500 символов). Можно использовать ## подзаголовки, **жирный**, списки. Не вставляй заголовок h1 внутрь body — он уже в frontmatter. В конце отдельным абзацем: 'Источник: [название издания](${item.link})'.",
  "category": "Одно из: 'iOS', 'Android', 'Приложения', 'Безопасность'",
  "imagePrompt": "Английский prompt для FLUX: абстрактная 3D-композиция по теме новости, editorial style, без текста. 15-30 слов."
}

tldrPoints — обязательно массив из 2-4 коротких пунктов (каждый 60-120 символов). Не один абзац, а именно массив.`;
}

function validateArticle(a, item) {
  const errors = [];
  if (!a.title || a.title.length < 20) errors.push('title too short');
  if (!a.slug || !/^[a-z0-9-]+$/.test(a.slug)) errors.push('invalid slug');
  if (!a.body || a.body.length < 800) errors.push('body too short');
  if (!a.description || a.description.length < 80) errors.push('description too short');
  if (!a.imagePrompt) errors.push('missing imagePrompt');
  if (!Array.isArray(a.tldrPoints) || a.tldrPoints.length < 2) errors.push('tldrPoints must be array of 2+');
  return errors;
}

async function writeArticle(item) {
  console.log(`  → GPT-5 пишет статью...`);
  const content = await callLLM(
    [
      { role: 'system', content: WRITER_SYSTEM },
      { role: 'user', content: buildWriterPrompt(item) },
    ],
    { responseFormat: 'json' }
  );
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Иногда LLM возвращает JSON внутри markdown — попробуем извлечь
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('LLM вернул невалидный JSON');
    parsed = JSON.parse(m[0]);
  }
  const errs = validateArticle(parsed);
  if (errs.length) throw new Error(`Валидация: ${errs.join(', ')}`);
  return parsed;
}

// --- сохранение MDX ------------------------------------------------------

function toMdx(a, item, heroPath) {
  const pubDate = new Date().toISOString().slice(0, 10);
  const escape = (s) => String(s).replace(/"/g, '\\"');
  const tldrArray = a.tldrPoints
    .map((p) => `    ${JSON.stringify(String(p))}`)
    .join(',\n');
  return `---
layout: ../../layouts/ArticleLayout.astro
title: "${escape(a.title)}"
description: "${escape(a.description)}"
h1: "${escape(a.h1 || a.title)}"
pubDate: ${pubDate}
category: "${escape(a.category || item.category || 'Новости')}"
breadcrumbs:
  - { name: "Главная", url: "/" }
  - { name: "Новости", url: "/novosti/" }
  - { name: "${escape(a.title)}" }
readingTime: ${Math.max(3, Math.round(a.body.length / 1000))}
hero: "${heroPath}"
heroAlt: "${escape(a.title)}"
---

import TLDR from '../../components/article/TLDR.astro';
import Callout from '../../components/article/Callout.astro';

<TLDR
  items={[
${tldrArray}
  ]}
/>

${a.body}
`;
}

// --- основной цикл -------------------------------------------------------

async function generateOne(item, state) {
  console.log(`\n[${item.category}] ${item.title.slice(0, 80)}`);
  console.log(`  src: ${item.source}`);

  const article = await writeArticle(item);

  const fullSlug = `${todayStamp()}-${article.slug}`.slice(0, 90);
  const mdxPath = path.join(NEWS_DIR, `${fullSlug}.mdx`);
  if (existsSync(mdxPath)) {
    console.log(`  ⟲ пропуск, уже существует: ${fullSlug}.mdx`);
    return null;
  }

  console.log(`  → FLUX 2 Pro генерит обложку...`);
  const imgBuf = await genImage(
    `${article.imagePrompt}, editorial magazine cover, minimalist 3D composition, ` +
      `soft volumetric lighting, clean studio background, photorealistic, 8k, no text, no logo`
  );

  const heroFile = `${fullSlug}.webp`;
  const heroAbs = path.join(HERO_DIR, heroFile);
  const heroUrl = `/images/hero/${heroFile}`;

  if (!DRY_RUN) {
    await mkdir(HERO_DIR, { recursive: true });
    await sharp(imgBuf)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toFile(heroAbs);

    await mkdir(NEWS_DIR, { recursive: true });
    await writeFile(mdxPath, toMdx(article, item, heroUrl));

    state.published.push({
      link: item.link,
      slug: fullSlug,
      title: article.title,
      publishedAt: new Date().toISOString(),
    });
  }

  console.log(`  ✓ /novosti/${fullSlug}/  +  ${heroFile}`);
  return { slug: fullSlug, title: article.title };
}

async function main() {
  console.log(`auto-publish: цель ${MAX_PER_RUN} статей, модель ${LLM_MODEL}`);

  const state = await loadState();
  console.log(`state: ${state.published.length} уже опубликовано`);

  console.log(`\nRSS:`);
  const items = await fetchAllFeeds();
  console.log(`итого: ${items.length} айтемов`);

  const fresh = pickFresh(items, state, MAX_PER_RUN * 2); // берём с запасом на случай ошибок
  console.log(`\nСвежих кандидатов: ${fresh.length}`);
  if (fresh.length === 0) {
    console.log('Нет новых новостей за последние 48 часов — выхожу.');
    return;
  }

  const published = [];
  for (const item of fresh) {
    if (published.length >= MAX_PER_RUN) break;
    try {
      const r = await generateOne(item, state);
      if (r) published.push(r);
    } catch (e) {
      console.error(`  ✗ ошибка: ${e.message}`);
    }
  }

  if (!DRY_RUN) await saveState(state);

  console.log(`\nИтог: опубликовано ${published.length} из ${MAX_PER_RUN}.`);
  for (const p of published) console.log(`  • ${p.slug}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
