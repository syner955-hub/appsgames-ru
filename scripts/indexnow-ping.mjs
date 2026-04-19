#!/usr/bin/env node
/**
 * IndexNow ping — мгновенно уведомляет поисковики (Яндекс, Bing, Seznam,
 * Yep) о новых/обновлённых URL сайта. Google НЕ поддерживает IndexNow —
 * для него работает стандартный sitemap-crawl.
 *
 * Документация: https://www.indexnow.org/documentation
 *
 * Как используется:
 *   1. В corn-задаче auto-publish.yml после git push берём список
 *      MDX-файлов, добавленных в последнем коммите, переводим в URL
 *      и POST'им в https://api.indexnow.org/indexnow.
 *   2. Вручную — можно запустить с CLI-аргументами (список URL).
 *
 * Запуск:
 *   node scripts/indexnow-ping.mjs https://appsgames.ru/novosti/foo/ https://appsgames.ru/bar/
 *   echo "https://appsgames.ru/a/\nhttps://appsgames.ru/b/" | node scripts/indexnow-ping.mjs
 *
 * Без аргументов — пингует все URL из sitemap-0.xml (полный re-index).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const HOST = 'appsgames.ru';
const KEY = '073486bff205e7d7614825745b083300';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function readStdinUrls() {
  if (process.stdin.isTTY) return [];
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks)
    .toString('utf8')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readSitemapUrls() {
  try {
    const fp = path.join(ROOT, 'dist/sitemap-0.xml');
    const xml = await readFile(fp, 'utf8');
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    return urls;
  } catch {
    // если нет локального билда — берём с прода
    const res = await fetch(`https://${HOST}/sitemap-0.xml`);
    const xml = await res.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  }
}

async function main() {
  const fromArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const fromStdin = await readStdinUrls();
  let urls = [...new Set([...fromArgs, ...fromStdin])].filter((u) =>
    u.startsWith(`https://${HOST}/`),
  );

  if (urls.length === 0) {
    console.log('Нет URL во входе — беру все из sitemap…');
    urls = await readSitemapUrls();
  }

  if (urls.length === 0) {
    console.error('Нечего пинговать.');
    process.exit(1);
  }

  console.log(`Пингую IndexNow для ${urls.length} URL`);
  urls.slice(0, 5).forEach((u) => console.log('  •', u));
  if (urls.length > 5) console.log(`  … и ещё ${urls.length - 5}`);

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const txt = await res.text().catch(() => '');
  console.log(`\nIndexNow ответ: ${res.status} ${res.statusText}`);
  if (txt) console.log(txt.slice(0, 500));

  // 200/202 — ОК. 400/403/422 — проблема с ключом/payload. 429 — rate limit.
  if (!res.ok) process.exit(2);
}

main().catch((e) => {
  console.error('IndexNow ping failed:', e);
  process.exit(1);
});
