/**
 * RSS-фид сайта: /rss.xml
 *
 * Собирает все MDX-страницы (новости + остальные разделы), сортирует
 * по pubDate desc, выдаёт топ-50 в валидном RSS 2.0. Удобно подписаться
 * в любой feed-reader (Feedly, Inoreader, Telegram @FeedsBot), чтобы
 * моментально видеть новые публикации cron'а.
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

type Fm = {
  title: string;
  description?: string;
  pubDate: string | Date;
  category?: string;
  hero?: string;
  heroAlt?: string;
};

type Mod = { frontmatter: Fm; url?: string };

export async function GET(context: APIContext) {
  const mods = import.meta.glob<Mod>('./**/*.mdx', { eager: true });

  const items = Object.entries(mods)
    .map(([file, m]) => {
      const fm = m.frontmatter;
      if (!fm?.title || !fm?.pubDate) return null;
      const url =
        m.url ??
        '/' +
          file
            .replace(/^\.\//, '')
            .replace(/\/index\.mdx$/, '/')
            .replace(/\.mdx$/, '/');
      return {
        title: fm.title,
        description: fm.description ?? '',
        pubDate: new Date(fm.pubDate),
        link: url,
        categories: fm.category ? [fm.category] : undefined,
        customData: fm.hero
          ? `<enclosure url="${new URL(fm.hero, context.site ?? 'https://appsgames.ru').toString()}" type="image/webp" />`
          : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 50);

  return rss({
    title: 'AppsGames.RU — iOS, Android, приложения и гаджеты',
    description:
      'Свежие новости из мира iPhone, Android, обзоры приложений, инструкции и советы по безопасности.',
    site: context.site ?? 'https://appsgames.ru',
    items,
    customData: '<language>ru-ru</language>',
    stylesheet: false,
  });
}
