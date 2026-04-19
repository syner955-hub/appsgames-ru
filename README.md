# AppsGames.ru

Статический сайт про обзоры мобильных приложений для iOS и Android.

## Стек

- [Astro 5](https://astro.build/) — статический генератор.
- Контент — Markdown/MDX в `src/content/posts/`.
- Хостинг — [Cloudflare Pages](https://pages.cloudflare.com/).
- CI/CD — auto-deploy из ветки `main`.

## Локальный запуск

```bash
nvm use           # берёт Node 22 из .nvmrc
npm install
npm run dev       # dev-сервер на http://localhost:4321
npm run build     # прод-сборка в ./dist
npm run preview   # локальный предпросмотр собранной версии
```

## Структура

```
appsgames-ru/
├── public/              # статические файлы (favicon, _redirects, robots.txt)
│   ├── _redirects       # 301 со старых URL на новые
│   └── robots.txt
├── src/
│   ├── components/      # Header, Footer, Card и т.п.
│   ├── content/         # Markdown-статьи и авторы
│   ├── content.config.ts  # схемы Content Collections
│   ├── layouts/         # базовые шаблоны
│   ├── pages/           # роуты
│   └── styles/          # глобальные CSS-переменные и типографика
└── astro.config.mjs
```

## Публикация

1. Коммит в `main` → Cloudflare Pages собирает и выкладывает.
2. Build command: `npm run build`.
3. Output directory: `dist`.

## Roadmap

- [x] Каркас Astro + главная-заглушка с `noindex`.
- [ ] Дизайн-система (light/dark, типографика, компоненты).
- [ ] Шаблоны: статья, категория, автор, обзор приложения.
- [ ] Миграция 10 сохранённых URL с реальным контентом.
- [ ] Генерация оставшихся 40 статей через внешний AI-пайплайн.
- [ ] Снятие `noindex`, сабмит sitemap в GSC и Яндекс.Вебмастер.
