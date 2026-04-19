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
const VISION_MODEL = process.env.VISION_MODEL || 'gpt-5'; // gpt-5 поддерживает image_url
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'flux-2-pro';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!TOKEN) {
  console.error('NANO_GPT_API_KEY не задан');
  process.exit(1);
}

// --- источники -----------------------------------------------------------

// Источники — широкая пользовательская тематика:
// новости, инструкции, обзоры приложений и гаджетов, российский контекст.
// Ориентир — как на AppleInsider.ru, iPhones.ru и других массовых изданиях.
const FEEDS = [
  // === EN — крупнейшие издания про iPhone/Android/приложения/гаджеты ===
  { url: 'https://9to5mac.com/feed/', lang: 'en', cat: 'iOS' },
  { url: 'https://9to5google.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.androidauthority.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.macrumors.com/macrumors.xml', lang: 'en', cat: 'iOS' },
  { url: 'https://www.androidpolice.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.phonearena.com/feed', lang: 'en', cat: 'Гаджеты' },
  { url: 'https://appleinsider.com/rss/news', lang: 'en', cat: 'iOS' },
  { url: 'https://www.xda-developers.com/feed/', lang: 'en', cat: 'Android' },
  { url: 'https://www.gsmarena.com/rss-news-reviews.php3', lang: 'en', cat: 'Гаджеты' },
  { url: 'https://www.makeuseof.com/feed/', lang: 'en', cat: 'Инструкции' },
  { url: 'https://www.howtogeek.com/feed/', lang: 'en', cat: 'Инструкции' },
  // === RU — массовые издания для пользователей ===
  { url: 'https://appleinsider.ru/feed', lang: 'ru', cat: 'iOS' },
  { url: 'https://www.iphones.ru/rss', lang: 'ru', cat: 'iOS' },
  { url: 'https://4pda.to/feed/', lang: 'ru', cat: 'Приложения' },
  { url: 'https://droider.ru/feed/', lang: 'ru', cat: 'Гаджеты' },
  { url: 'https://tvoy-android.com/feed/', lang: 'ru', cat: 'Android' },
  { url: 'https://it-here.ru/feed/', lang: 'ru', cat: 'Приложения' },
  { url: 'https://mobiltelefon.ru/rss.xml', lang: 'ru', cat: 'Гаджеты' },
];

// Ключевые слова, после которых кандидата ЖЁСТКО отбрасываем.
// Оставляем только реально нерелевантное: разработку, политику, крипту.
// Гаджеты (наушники/часы/повербанки/аэрогрили) СПЕЦИАЛЬНО пропускаем — на AppleInsider.ru они есть.
const BLOCKLIST_KEYWORDS = [
  // Разработка / код (чисто для программистов)
  'swiftui','uikit','kotlin dsl','jetpack compose','xcode','android studio',
  'flutter','react native','ci/cd','devops','coroutine',
  'рефакторинг','open source','исходник','tutorial',
  // Крипта и политика
  'криптовалют','crypto','nft','блокчейн','blockchain','биткоин','bitcoin','web3',
  'stablecoin','eth','ethereum','solana',
  'выборы','коронавирус','covid','саммит','санкции',
  // Чисто-автомобильные / недвижимость
  'тесла','tesla model','жиль',
];

// Ключевые слова, ПОВЫШАЮЩИЕ приоритет (наша ЦА точно кликнет).
// Широкая тематика: приложения, гаджеты, инструкции, российский контекст.
const BOOSTLIST_KEYWORDS = [
  // Платформы и приложения
  'ios ','android','iphone','ipad','macbook','mac ','ipod',
  'приложени','app store','google play','rustore','russtore',
  'whatsapp','telegram','max ','youtube','instagram','tiktok','spotify','netflix',
  // Инструкции (очень кликают)
  'как ','инструкция','пошагов','гайд','настрои','настроен','способ','лайфхак',
  // Российский контекст
  'россия','россий','ркн','банк','сбербанк','тинькофф','альфа-банк','озон','яндекс',
  // Безопасность/приватность
  'vpn','антивирус','безопасност','приватност','2fa','пароль','мошенн','фейков',
  // Новости / анонсы / обзоры
  'вышел','вышла','вышло','релиз','выпустил','анонс','представи','обнов',
  'обзор','сравнени','тест','отзыв','подборк','топ ','лучш',
  // Гаджеты и аксессуары
  'airpods','apple watch','apple tv','homepod','наушник','колонк','повербанк',
  'часы','умн','смарт','беспроводн','зарядк','dock','чехол','кабел',
  // Проблемы и фиксы
  'проблем','ошибк','не работает','не включает','бесконеч','тормоз','перегрев',
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

const parser = new Parser({
  timeout: 20000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ],
  },
});

function extractImageUrl(item) {
  // 1. enclosure (MacRumors, Habr и пр.)
  const enc = item.enclosure;
  if (enc?.url && /^image\//i.test(enc.type || '')) return enc.url;
  if (enc?.url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enc.url)) return enc.url;

  // 2. media:content (9to5Mac, Android Authority)
  const mc = item.mediaContent?.[0]?.$ || item['media:content']?.$;
  if (mc?.url) return mc.url;

  // 3. media:thumbnail
  const mt = item.mediaThumbnail?.[0]?.$ || item['media:thumbnail']?.$;
  if (mt?.url) return mt.url;

  // 4. первый <img src="..."> в контенте
  const html = item['content:encoded'] || item.content || item.summary || '';
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];

  return null;
}

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
          imageUrl: extractImageUrl(item),
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

async function callLLM(messages, { responseFormat, model } = {}) {
  const body = {
    model: model || LLM_MODEL,
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

/**
 * Описываем картинку из RSS через vision-модель: что изображено,
 * палитра, стиль. Результат используем как контекст для FLUX-prompt.
 * В случае любой ошибки (модель не vision, картинка недоступна, таймаут)
 * возвращаем null — пайплайн продолжит работать без vision-контекста.
 */
async function describeOriginalImage(imageUrl) {
  if (!imageUrl) return null;
  try {
    // Предварительная загрузка → base64 (многие vision-API так надёжнее работают)
    const r = await fetch(imageUrl);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//i.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null; // >4MB пропускаем
    const b64 = buf.toString('base64');
    const dataUrl = `data:${ct};base64,${b64}`;

    const content = await callLLM(
      [
        {
          role: 'system',
          content:
            'Ты аналитик визуального контента. Кратко опиши изображение по пунктам: ' +
            '(1) главные объекты, (2) цветовая палитра (2-4 ключевых цвета), ' +
            '(3) стиль (фото/3D-рендер/иллюстрация/UI-скриншот), (4) настроение/свет. ' +
            'Формат: 2-4 короткие строки на английском. Без воды.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image shortly:' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      { model: VISION_MODEL }
    );
    return content?.trim().slice(0, 600) || null;
  } catch (e) {
    console.warn(`  vision: ${e.message}`);
    return null;
  }
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

const WRITER_SYSTEM = `Ты редактор русскоязычного пользовательского портала AppsGames.ru.
Пишешь для обычных владельцев iPhone/iPad/Mac/Android — не для разработчиков.
Тематика как у AppleInsider.ru и iPhones.ru: новости, инструкции, обзоры приложений
и гаджетов, разбор проблем, лайфхаки, российский контекст (банки, VPN, App Store в РФ).

СТРОГИЕ ПРАВИЛА:
- Пиши ТОЛЬКО на русском языке.
- НЕ копируй формулировки источника дословно — переписывай своими словами.
- Если источник английский — переводи и адаптируй для русской аудитории.
- Добавляй контекст: что это значит для пользователя в России, работает ли в РФ,
  есть ли альтернативы, как это обходится.
- Обязательно укажи источник в конце отдельным абзацем с ссылкой.
- Избегай clickbait, канцелярита ("качественный", "индивидуальный подход",
  "лидер рынка", "инновационный"). Разговорный, но экспертный тон.
- Объём тела статьи: 1800-3000 символов (~300-500 слов).

ВЫБОР ФОРМАТА — определи по сути материала:
  * news — анонс, релиз, слухи, инсайды, обновления. Структура:
    TL;DR → что произошло → детали → что это значит для тебя.
  * howto — инструкция "как сделать X". Структура:
    TL;DR → зачем это нужно → пошаговая инструкция (нумерованный список
    или H2-подзаголовки) → возможные проблемы и решения.
  * review — обзор приложения или гаджета. Структура:
    TL;DR → кому подойдёт → плюсы и минусы → итог.
  * explainer — разбор: "почему X", "что такое Y", "стоит ли Z". Структура:
    TL;DR → суть вопроса → аргументы → вывод.
  * roundup — подборка "топ-N". Структура:
    TL;DR → критерии отбора → список с пунктами → рекомендация.

ФОРМАТ ОТВЕТА: только валидный JSON, без markdown обёртки.`;

function buildWriterPrompt(item, imageDescription) {
  const imageSection = imageDescription
    ? `\nОРИГИНАЛЬНАЯ КАРТИНКА ИЗ ИСТОЧНИКА (краткое описание):\n${imageDescription}\n`
    : '';

  const imagePromptRule = imageDescription
    ? `"imagePrompt": "Английский prompt для FLUX 2 Pro. ВАЖНО: используй тему, основные объекты и цветовую палитру из описания оригинальной картинки выше — чтобы наша обложка была семантически близкой к исходной статье. НО: это должна быть НАША оригинальная иллюстрация — editorial magazine style, чистая композиция, soft lighting, photorealistic, без текста, логотипов и узнаваемых лиц. 25-40 слов."`
    : `"imagePrompt": "Английский prompt для FLUX 2 Pro: editorial magazine cover иллюстрация по теме новости, минималистичная 3D-композиция, мягкий свет, без текста и логотипов. 20-35 слов. Укажи 2-3 ключевых объекта и палитру."`;

  return `Напиши новость на основе этого источника.

ИСТОЧНИК:
- Заголовок: ${item.title}
- Описание: ${item.summary}
- Ссылка: ${item.link}
- Издание: ${item.source}
- Язык источника: ${item.lang === 'ru' ? 'русский' : 'английский (нужно переводить и адаптировать)'}
- Тематика: ${item.category}
${imageSection}
ТРЕБОВАНИЯ К JSON:
{
  "format": "news | howto | review | explainer | roundup — выбери один формат по сути материала",
  "title": "Короткий заголовок на русском (60-90 символов, без кавычек и emoji)",
  "h1": "Заголовок h1 (может совпадать с title или быть немного длиннее, 60-110 символов)",
  "description": "SEO-описание для meta-тега (140-180 символов, выжимка сути)",
  "slug": "url-slug-only-latin-letters-and-hyphens",
  "tldrPoints": ["Пункт 1 TL;DR (1 предложение)", "Пункт 2", "Пункт 3"],
  "body": "Основной текст в markdown (1800-3000 символов). Можно использовать ## подзаголовки, **жирный**, списки, пронумерованные списки. Не вставляй заголовок h1 внутрь body — он уже в frontmatter. В конце отдельным абзацем: 'Источник: [название издания](${item.link})'.",
  "category": "Одно из: 'iOS', 'Android', 'Приложения', 'Гаджеты', 'Безопасность', 'Инструкции' — выбирай по смыслу статьи",
  ${imagePromptRule}
}

tldrPoints — обязательно массив из 2-4 коротких пунктов (каждый 60-120 символов). Не один абзац, а именно массив.
Категория "Инструкции" — если format=howto, независимо от платформы. Категория "Гаджеты" — для обзоров/новостей про железо (наушники, часы, повербанки и т.п.).`;
}

const ALLOWED_FORMATS = ['news', 'howto', 'review', 'explainer', 'roundup'];
const ALLOWED_CATEGORIES = ['iOS', 'Android', 'Приложения', 'Гаджеты', 'Безопасность', 'Инструкции'];

function validateArticle(a, item) {
  const errors = [];
  if (!a.title || a.title.length < 20) errors.push('title too short');
  if (!a.slug || !/^[a-z0-9-]+$/.test(a.slug)) errors.push('invalid slug');
  if (!a.body || a.body.length < 800) errors.push('body too short');
  if (!a.description || a.description.length < 80) errors.push('description too short');
  if (!a.imagePrompt) errors.push('missing imagePrompt');
  if (!Array.isArray(a.tldrPoints) || a.tldrPoints.length < 2) errors.push('tldrPoints must be array of 2+');
  if (a.format && !ALLOWED_FORMATS.includes(a.format)) a.format = 'news';
  if (a.category && !ALLOWED_CATEGORIES.includes(a.category)) a.category = null;
  return errors;
}

async function writeArticle(item, imageDescription) {
  console.log(`  → GPT-5 пишет статью${imageDescription ? ' (с учётом оригинальной картинки)' : ''}...`);
  const content = await callLLM(
    [
      { role: 'system', content: WRITER_SYSTEM },
      { role: 'user', content: buildWriterPrompt(item, imageDescription) },
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
  const format = a.format || 'news';
  return `---
layout: ../../layouts/ArticleLayout.astro
title: "${escape(a.title)}"
description: "${escape(a.description)}"
h1: "${escape(a.h1 || a.title)}"
pubDate: ${pubDate}
category: "${escape(a.category || item.category || 'Новости')}"
format: "${format}"
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

  let imageDescription = null;
  if (item.imageUrl) {
    console.log(`  → vision: читаю оригинальную картинку (${item.imageUrl.slice(0, 60)}…)`);
    imageDescription = await describeOriginalImage(item.imageUrl);
    if (imageDescription) {
      console.log(`    ✓ ${imageDescription.replace(/\n/g, ' | ').slice(0, 140)}…`);
    } else {
      console.log(`    ⟲ vision не смог разобрать, fallback на generic prompt`);
    }
  } else {
    console.log(`  (в RSS нет картинки — генерим по заголовку)`);
  }

  const article = await writeArticle(item, imageDescription);

  const fullSlug = `${todayStamp()}-${article.slug}`.slice(0, 90);
  const mdxPath = path.join(NEWS_DIR, `${fullSlug}.mdx`);
  if (existsSync(mdxPath)) {
    console.log(`  ⟲ пропуск, уже существует: ${fullSlug}.mdx`);
    return null;
  }

  console.log(`  → FLUX 2 Pro генерит обложку...`);
  // Базовый стилевой суффикс — чтобы все обложки сайта смотрелись в одной эстетике,
  // даже если GPT-5 не добавил эти хвосты сам.
  const styleSuffix =
    ', editorial magazine cover style, clean composition, soft lighting, ' +
    'photorealistic, high detail, 8k, no text, no letters, no logos, no watermarks';
  console.log(`    prompt: ${article.imagePrompt.slice(0, 120)}…`);
  const imgBuf = await genImage(article.imagePrompt + styleSuffix);

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
