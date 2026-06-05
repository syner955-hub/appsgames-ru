#!/usr/bin/env node
/**
 * Генератор hero-обложек для страниц казино.
 * Создаёт PNG 800×800 с градиентом и названием бренда.
 * Запуск: node scripts/generate-casino-heroes.mjs
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const FONTS_DIR = path.join(ROOT, 'src/assets/fonts');
const OUT_DIR = path.join(ROOT, 'public/images/casino');

const brands = [
  { slug: 'slotozal', name: 'Slotozal', color1: '#6C3CE1', color2: '#1A0B3D' },
  { slug: 'maxslots', name: 'MaxSlots', color1: '#FF6B00', color2: '#3D1A00' },
  { slug: 'beef-casino', name: 'Beef Casino', color1: '#DC2626', color2: '#450A0A' },
  { slug: 'legzo-casino', name: 'Legzo Casino', color1: '#0EA5E9', color2: '#0C2D48' },
  { slug: 'leebet', name: 'Leebet', color1: '#10B981', color2: '#022C22' },
  { slug: 'r7-casino', name: 'R7 Casino', color1: '#F59E0B', color2: '#451A03' },
  { slug: 'starda-casino', name: 'Starda Casino', color1: '#8B5CF6', color2: '#1E1B4B' },
  { slug: 'kometa-casino', name: 'Kometa Casino', color1: '#3B82F6', color2: '#0F172A' },
  { slug: '7k-casino', name: '7K Casino', color1: '#EF4444', color2: '#1C0404' },
  { slug: 'vavada', name: 'Vavada', color1: '#F97316', color2: '#431407' },
  { slug: 'vulkan', name: 'Вулкан', color1: '#DC2626', color2: '#1F0000' },
  { slug: 'pharaon-casino', name: 'Pharaon Casino', color1: '#D4A017', color2: '#2D1F00' },
  { slug: 'vodka-casino', name: 'Vodka Casino', color1: '#06B6D4', color2: '#042F2E' },
  { slug: 'pinco-casino', name: 'Pinco Casino', color1: '#EC4899', color2: '#4A044E' },
  { slug: 'leon-casino', name: 'Leon Casino', color1: '#F59E0B', color2: '#3B1D00' },
  { slug: 'arkada-casino', name: 'Arkada Casino', color1: '#8B5CF6', color2: '#1E1B4B' },
  { slug: 'dragon-money-casino', name: 'Dragon Money', color1: '#EF4444', color2: '#3F0A0A' },
  { slug: 'mellstroy-casino', name: 'Mellstroy Casino', color1: '#F97316', color2: '#431407' },
  { slug: '1xbet-casino', name: '1xBet Casino', color1: '#2563EB', color2: '#0F172A' },
  { slug: '1win-casino', name: '1Win Casino', color1: '#06B6D4', color2: '#0C2D48' },
  { slug: 'flagman-casino', name: 'Flagman Casino', color1: '#10B981', color2: '#022C22' },
  { slug: 'zooma-casino', name: 'Zooma Casino', color1: '#E11D48', color2: '#3F0A1B' },
  { slug: 'pin-up-casino', name: 'Pin-Up Casino', color1: '#F43F5E', color2: '#4C0519' },
  { slug: 'riobet-casino', name: 'Riobet Casino', color1: '#14B8A6', color2: '#042F2E' },
  { slug: 'champion-casino', name: 'Champion Casino', color1: '#EAB308', color2: '#422006' },
  { slug: 'selector-casino', name: 'Selector Casino', color1: '#6366F1', color2: '#1E1B4B' },
  { slug: 'mostbet-casino', name: 'Mostbet Casino', color1: '#2563EB', color2: '#082F49' },
  { slug: 'cat-casino', name: 'Cat Casino', color1: '#F59E0B', color2: '#451A03' },
  { slug: 'pokerdom-casino', name: 'Pokerdom Casino', color1: '#10B981', color2: '#052E16' },
  { slug: 'daddy-casino', name: 'Daddy Casino', color1: '#7C3AED', color2: '#2E1065' },
  { slug: 'kaktus-casino', name: 'Kaktus Casino', color1: '#22C55E', color2: '#14532D' },
  { slug: 'stake-casino', name: 'Stake Casino', color1: '#06B6D4', color2: '#164E63' },
  { slug: 'joy-casino', name: 'Joy Casino', color1: '#EC4899', color2: '#500724' },
];

async function loadFonts() {
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONTS_DIR, 'Inter-Regular.ttf')),
    readFile(path.join(FONTS_DIR, 'Inter-Bold.ttf')),
  ]);
  return { regular, bold };
}

async function renderHero(brand, fonts) {
  const tree = {
    type: 'div',
    props: {
      style: {
        width: '800px',
        height: '800px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter',
        color: '#ffffff',
        backgroundImage: `linear-gradient(145deg, ${brand.color1} 0%, ${brand.color2} 100%)`,
        position: 'relative',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              bottom: '0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.06,
            },
            children: {
              type: 'div',
              props: {
                style: {
                  width: '500px',
                  height: '500px',
                  borderRadius: '9999px',
                  border: '3px solid #ffffff',
                },
              },
            },
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: '120px',
                    height: '120px',
                    borderRadius: '28px',
                    background: 'rgba(255,255,255,0.15)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                    fontWeight: 700,
                  },
                  children: brand.name.charAt(0),
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '52px',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    textAlign: 'center',
                    maxWidth: '650px',
                  },
                  children: brand.name,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 400,
                    opacity: 0.7,
                    textAlign: 'center',
                  },
                  children: 'Скачать на Android и iOS',
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '18px',
              fontWeight: 600,
              opacity: 0.5,
            },
            children: 'appsgames.ru',
          },
        },
      ],
    },
  };

  const svg = await satori(tree, {
    width: 800,
    height: 800,
    fonts: [
      { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } });
  return resvg.render().asPng();
}

async function main() {
  const fonts = await loadFonts();
  await mkdir(OUT_DIR, { recursive: true });

  for (const brand of brands) {
    const png = await renderHero(brand, fonts);
    const outFile = path.join(OUT_DIR, `${brand.slug}.png`);
    await writeFile(outFile, png);
    console.log(`✓ ${brand.name} → ${brand.slug}.png`);
  }
  console.log(`\nГотово: ${brands.length} обложек → public/images/casino/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
