import type { APIRoute } from 'astro';
import { renderOgPng } from '../../lib/og.ts';
import { resolveCategory, resolveIcon, resolveCategoryLabel } from '../../lib/hero.ts';

interface PageMeta {
  title: string;
  pathname: string;
}

// Собираем все MDX-страницы: их берём из frontmatter
const mdxModules = import.meta.glob<{
  frontmatter?: { title?: string; h1?: string };
}>('../**/*.mdx', { eager: true });

// Собираем Astro-страницы (хабы, главная, легальные) — у них title приходится
// угадывать из имени, поэтому подмешаем вручную ниже.
const astroModules = import.meta.glob('../**/*.astro', { eager: true });

const astroTitles: Record<string, string> = {
  '/': 'AppsGames.ru — гайды и обзоры приложений',
  '/ios/': 'iOS: гайды и обзоры для iPhone и iPad',
  '/android/': 'Android: инструкции и обзоры приложений',
  '/obzory/': 'Обзоры приложений и сервисов',
  '/sovety/': 'Советы по смартфонам и приложениям',
  '/bezopasnost/': 'Безопасность смартфона и онлайн-аккаунтов',
  '/o-nas/': 'О нас — AppsGames.ru',
  '/redakciya/': 'Редакция AppsGames.ru',
  '/kontakty/': 'Контакты AppsGames.ru',
  '/politika-konfidencialnosti/': 'Политика конфиденциальности',
};

function modulePathToUrl(modulePath: string): string {
  // '../ios/kak-sdelat/udalit-prilozhenie-iphone.mdx' → '/ios/kak-sdelat/udalit-prilozhenie-iphone/'
  let p = modulePath.replace(/^\.\.\//, '/').replace(/\.(mdx|astro)$/, '');
  if (p.endsWith('/index')) p = p.slice(0, -'index'.length);
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

function collectPages(): PageMeta[] {
  const pages: PageMeta[] = [];

  for (const [modPath, mod] of Object.entries(mdxModules)) {
    const fm = mod.frontmatter ?? {};
    const title = fm.h1 ?? fm.title ?? '';
    if (!title) continue;
    pages.push({
      title,
      pathname: modulePathToUrl(modPath),
    });
  }

  for (const [modPath] of Object.entries(astroModules)) {
    const pathname = modulePathToUrl(modPath);
    // Для OG-эндпоинтов, 404.astro и т.д. — пропускаем
    if (
      pathname.includes('/og/') ||
      pathname.startsWith('/404') ||
      pathname.startsWith('/api/')
    ) {
      continue;
    }
    const title = astroTitles[pathname];
    if (!title) continue;
    pages.push({ title, pathname });
  }

  return pages;
}

export function getStaticPaths() {
  const pages = collectPages();
  return pages.map((page) => {
    const slugPath = page.pathname.replace(/^\/|\/$/g, '') || 'index';
    return {
      params: { slug: slugPath },
      props: { title: page.title, pathname: page.pathname },
    };
  });
}

export const GET: APIRoute = async ({ props }) => {
  const { title, pathname } = props as { title: string; pathname: string };
  const category = resolveCategory(pathname);
  const icon = resolveIcon(pathname, category);
  const eyebrow = resolveCategoryLabel(category);

  const png = await renderOgPng({ title, category, icon, eyebrow });

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
