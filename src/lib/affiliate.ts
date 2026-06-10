/**
 * Партнёрские ссылки и распределение 50/50 по брендам.
 *
 * Назначение детерминированное (по слагу бренда): один и тот же бренд
 * всегда уходит на одну и ту же сеть — и для /go/, и для /go/apk/.
 * Это даёт стабильную аналитику и ровный сплит ~50/50 по всем брендам.
 */
import casinos from '../data/casinos.json';

export const AFFILIATE_LINKS = [
  'https://win-halllucky.com/l/69d4bae2d788d3223f0a2a02?sub_id=prilo',
  'https://lvlx.click/tuqagqjg8',
] as const;

// Точное 50/50: бренды в стабильном порядке (по слагу), чётный индекс → A, нечётный → B.
const ORDER = Object.keys(casinos).sort();
const ASSIGN = new Map<string, string>(
  ORDER.map((slug, i) => [slug, AFFILIATE_LINKS[i % AFFILIATE_LINKS.length]]),
);

/** Партнёрская ссылка для бренда (ровный сплит 50/50 по брендам). */
export function affiliateFor(slug: string): string {
  return ASSIGN.get(slug) ?? AFFILIATE_LINKS[0];
}
