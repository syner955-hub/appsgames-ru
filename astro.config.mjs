// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://appsgames.ru',
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        // Исключаем служебные страницы
        const servicePages = [
          '/kontakty/',
          '/politika-konfidencialnosti/',
          '/redakciya/',
          '/o-proekte/',
        ];
        // Исключаем устаревшие разделы без хаб-страниц
        const legacySections = [
          '/poleznoe-ios/',
          '/poleznoe-dlya-android/',
          '/uroki-po-ios/',
          '/dopolnitelnyjj-soft/',
        ];
        const path = page.replace('https://appsgames.ru', '');
        if (servicePages.some((p) => path === p)) return false;
        if (legacySections.some((p) => path.startsWith(p))) return false;
        // /go/ — партнёрские редиректы: noindex + Disallow в robots.txt.
        // В sitemap им не место (иначе в GSC ошибка "Submitted URL blocked by robots.txt").
        if (path.startsWith('/go/')) return false;
        if (page.includes('/draft/')) return false;
        return true;
      },
    }),
  ],
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
  },
});
