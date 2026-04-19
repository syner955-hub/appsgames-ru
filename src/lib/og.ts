/**
 * OG-рендерер: на вход — параметры страницы, на выходе — Buffer с PNG 1200×630.
 * Используется endpoint-ом `/og/[...slug].png.ts` при статическом билде.
 *
 * Стек: satori (собирает SVG из JSON-дерева) + @resvg/resvg-js (SVG → PNG).
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { HeroCategory, HeroIcon } from './hero.ts';

// Ленивая загрузка шрифтов: читается один раз за билд.
// Путь резолвится от корня проекта (process.cwd()), это стабильно при
// astro build — независимо от того, куда Vite положил скомпилированный модуль.
let fontsPromise: Promise<{
  regular: Buffer;
  bold: Buffer;
}> | null = null;

async function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const fontsDir = path.resolve(process.cwd(), 'src/assets/fonts');
      const [regular, bold] = await Promise.all([
        readFile(path.join(fontsDir, 'Inter-Regular.ttf')),
        readFile(path.join(fontsDir, 'Inter-Bold.ttf')),
      ]);
      return { regular, bold };
    })();
  }
  return fontsPromise;
}

type Theme = {
  a: string;
  b: string;
  accent: string;
  label: string;
};

const themes: Record<HeroCategory, Theme> = {
  ios: { a: '#0a84ff', b: '#0038a8', accent: '#eaf3ff', label: 'iOS' },
  android: { a: '#3ddc84', b: '#0f6b3a', accent: '#e7fbef', label: 'Android' },
  obzory: { a: '#a855f7', b: '#581c87', accent: '#f5ecff', label: 'Обзоры' },
  sovety: { a: '#f97316', b: '#9a3412', accent: '#fff0e3', label: 'Советы' },
  bezopasnost: { a: '#ef4444', b: '#7f1d1d', accent: '#ffe8e8', label: 'Безопасность' },
  default: { a: '#334155', b: '#0f172a', accent: '#e2e8f0', label: 'AppsGames' },
};

/**
 * SVG-иконки как geometric path. satori рендерит произвольный SVG только
 * через <img src="data:image/svg+xml;..."> — это даёт нам чистые
 * векторные фигуры вместо glyph-ов шрифта (которых в Inter нет).
 */
function iconSvgPath(icon: HeroIcon): string {
  switch (icon) {
    case 'apple':
      return `<path d="M280 100 c14-26 40-40 66-42 4 26-10 48-24 62-14 18-38 30-58 28-2-20 6-34 16-48z
        M340 158 c-40-12-76 12-90 12s-48-24-82-10c-38 18-50 76-22 134 12 26 34 58 62 58 20 0 30-14 54-14s34 14 54 14c26 0 48-30 60-56 14-28 20-50 20-50s-38-14-34-58c2-38 32-52 32-52s-14-20-54-22z" />`;
    case 'android':
      return `<g>
        <rect x="30" y="170" width="340" height="170" rx="16" fill="currentColor"/>
        <rect x="14" y="182" width="34" height="120" rx="14" fill="currentColor"/>
        <rect x="352" y="182" width="34" height="120" rx="14" fill="currentColor"/>
        <rect x="90" y="340" width="34" height="96" rx="14" fill="currentColor"/>
        <rect x="276" y="340" width="34" height="96" rx="14" fill="currentColor"/>
        <path d="M30 160 C30 90 100 38 200 38 C300 38 370 90 370 160 Z" fill="currentColor"/>
        <circle cx="136" cy="110" r="10" fill="#0b0d12"/>
        <circle cx="264" cy="110" r="10" fill="#0b0d12"/>
        <path d="M112 58 L92 26 M288 58 L308 26" stroke="currentColor" stroke-width="12" stroke-linecap="round" fill="none"/>
      </g>`;
    case 'star':
      return `<path d="M200 32 l52 108 l116 14 l-86 78 l24 116 l-106-58 l-106 58 l24-116 l-86-78 l116-14z" />`;
    case 'bulb':
      return `<g>
        <path d="M200 56 c-56 0-98 44-98 98 0 38 20 64 40 82 10 10 16 22 16 36 v12 h84 v-12 c0-14 6-26 16-36 20-18 40-44 40-82 0-54-42-98-98-98z" fill="currentColor"/>
        <rect x="158" y="298" width="84" height="22" rx="6" fill="currentColor"/>
        <rect x="170" y="330" width="60" height="14" rx="6" fill="currentColor"/>
      </g>`;
    case 'shield':
      return `<path d="M200 24 l142 52 v108 c0 100-70 172-142 204-72-32-142-104-142-204v-108z" />`;
    case 'bolt':
      return `<path d="M214 22 l-114 208 h84 l-40 162 l164-226 h-82 l28-144z" />`;
    case 'download':
      return `<g>
        <rect x="170" y="40" width="60" height="190" rx="10" fill="currentColor"/>
        <path d="M96 198 l104 128 l104-128 h-62 v-80 h-84 v80z" fill="currentColor"/>
        <rect x="56" y="346" width="288" height="28" rx="12" fill="currentColor"/>
      </g>`;
    case 'cloud':
      return `<path d="M310 220 c28-4 52 18 52 46 s-24 48-52 48 h-228 c-38 0-70-30-70-68 0-34 26-62 60-66 8-46 48-80 98-80 54 0 96 40 98 94 14 2 28 10 42 26z" />`;
    case 'lock':
      return `<g>
        <rect x="80" y="170" width="240" height="200" rx="20" fill="currentColor"/>
        <path d="M130 170 v-40 c0-40 32-70 70-70 s70 30 70 70 v40" fill="none" stroke="currentColor" stroke-width="22"/>
        <circle cx="200" cy="260" r="22" fill="#0b0d12"/>
        <rect x="190" y="272" width="20" height="50" rx="6" fill="#0b0d12"/>
      </g>`;
    case 'trash':
      return `<g>
        <rect x="80" y="120" width="240" height="40" rx="8" fill="currentColor"/>
        <rect x="160" y="80" width="80" height="40" rx="8" fill="currentColor"/>
        <path d="M100 160 h200 l-20 222 c-2 12-12 20-24 20 h-112 c-12 0-22-8-24-20z" fill="currentColor"/>
      </g>`;
    case 'refresh':
      return `<g fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round">
        <path d="M328 170 C300 110 244 74 180 86 120 96 78 146 74 206" />
        <polyline points="70,150 74,210 134,198" stroke-linejoin="round" />
        <path d="M72 234 c28 60 84 96 148 84 60-10 102-60 106-120" />
        <polyline points="330,254 326,194 266,206" stroke-linejoin="round" />
      </g>`;
    case 'battery':
      return `<g>
        <rect x="30" y="130" width="310" height="140" rx="18" fill="none" stroke="currentColor" stroke-width="20"/>
        <rect x="60" y="160" width="170" height="80" rx="6" fill="currentColor"/>
        <rect x="354" y="170" width="30" height="60" rx="8" fill="currentColor"/>
      </g>`;
    case 'key':
      return `<g>
        <circle cx="110" cy="200" r="70" fill="none" stroke="currentColor" stroke-width="24"/>
        <rect x="180" y="188" width="200" height="24" fill="currentColor"/>
        <rect x="290" y="212" width="24" height="52" fill="currentColor"/>
        <rect x="346" y="212" width="24" height="40" fill="currentColor"/>
      </g>`;
    case 'eye':
      return `<g>
        <path d="M20 200 c40-80 120-120 180-120 s140 40 180 120 c-40 80-120 120-180 120 s-140-40-180-120z" fill="currentColor"/>
        <circle cx="200" cy="200" r="56" fill="#0b0d12"/>
        <circle cx="224" cy="180" r="14" fill="currentColor"/>
      </g>`;
    case 'messages':
      return `<g>
        <path d="M78 92 h180 c22 0 40 18 40 40 v128 c0 22-18 40-40 40 h-50 l-50 50 v-50 h-80 c-22 0-40-18-40-40 v-128 c0-22 18-40 40-40z" fill="currentColor"/>
        <path d="M180 200 h180 c22 0 40 18 40 40 v100 c0 22-18 40-40 40 h-40 l-40 40 v-40 h-100 c-22 0-40-18-40-40 v-100 c0-22 18-40 40-40z" fill="currentColor" fill-opacity="0.55"/>
      </g>`;
    default:
      return `<circle cx="200" cy="200" r="140" fill="currentColor"/>`;
  }
}

function iconDataUri(icon: HeroIcon, color: string): string {
  const inner = iconSvgPath(icon);
  // currentColor заменяем на нужный цвет; экранируем # для data-URI.
  const colored = inner.replace(/currentColor/g, color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="${color}" stroke="${color}" stroke-width="8" stroke-linejoin="round">${colored}</svg>`;
  // Компактная URL-encode без base64 (работает быстрее)
  const encoded = svg
    .replace(/\n/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/#/g, '%23')
    .replace(/"/g, "'");
  return `data:image/svg+xml;utf8,${encoded}`;
}

export interface OgInput {
  title: string;
  category: HeroCategory;
  icon: HeroIcon;
  eyebrow?: string;
}

export async function renderOgPng({
  title,
  category,
  icon,
  eyebrow,
}: OgInput): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const t = themes[category] ?? themes.default;
  const tagline = eyebrow ?? t.label;
  const iconUri = iconDataUri(icon, '#ffffff');

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
          color: '#ffffff',
          fontFamily: 'Inter',
          backgroundImage: `linear-gradient(135deg, ${t.a} 0%, ${t.b} 100%)`,
          position: 'relative',
        },
        children: [
          // декоративный круг-иконка справа
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                right: '60px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '340px',
                height: '340px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '9999px',
                background: 'rgba(255,255,255,0.1)',
                border: '2px solid rgba(255,255,255,0.25)',
              },
              children: {
                type: 'img',
                props: {
                  src: iconUri,
                  width: 200,
                  height: 200,
                  style: { opacity: 0.75 },
                },
              },
            },
          },
          // верхний блок: eyebrow
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '3px',
                textTransform: 'uppercase',
                opacity: 0.9,
              },
              children: tagline.toUpperCase(),
            },
          },
          // центр: заголовок
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                fontSize: '64px',
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: '-0.015em',
                maxWidth: '760px',
              },
              children: title,
            },
          },
          // низ: бренд
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                fontSize: '22px',
                fontWeight: 600,
                opacity: 0.9,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '10px',
                      height: '26px',
                      background: '#ffffff',
                      marginRight: '14px',
                      borderRadius: '3px',
                    },
                    children: '',
                  },
                },
                'AppsGames.ru',
              ],
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Inter',
          data: fonts.regular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fonts.bold,
          weight: 700,
          style: 'normal',
        },
      ],
    },
  );

  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  })
    .render()
    .asPng();

  return png;
}
