# Instagram/Reels Embed Worker

Это не статический GitHub Pages-вариант. Это Cloudflare Worker, потому что Telegram/VK/Discord читают Open Graph meta-теги из HTML и не выполняют JavaScript.

## Что делает

- `/` — генератор ссылки.
- `/u/<base64url>` — embed-страница с серверными `og:title`, `og:description`, `og:image`.
- `/api?u=...` — JSON с автоматически подхваченными метаданными.
- `/oembed?u=...` — простой oEmbed JSON.
- `/fallback.jpg` — локальная fallback-обложка.

Поддерживаются ссылки:

- `https://www.instagram.com/reel/.../`
- `https://www.instagram.com/p/.../`
- `https://www.instagram.com/tv/.../`
- `https://www.kkinstagram.com/reel/.../`

## Деплой

```bash
npm install
npx wrangler login
npm run deploy
```

После деплоя открой URL Worker, вставь ссылку на Instagram и скопируй ссылку вида:

```text
https://ig-embed-worker.<account>.workers.dev/u/....
```

Именно эту ссылку отправляй в Telegram/VK/Discord.

## Почему не GitHub Pages

GitHub Pages отдаёт статические файлы. Для Telegram/VK/Discord нужна страница, которая уже на сервере вернёт готовые Open Graph meta-теги для конкретной ссылки. Статический `embed.html?u=...` не подходит: JS в мессенджерах не выполняется.

## Ограничение

Meta может не отдать Open Graph метаданные для некоторых публикаций или может вернуть страницу входа/ошибку. В этом случае Worker отдаст стабильную fallback-карточку с кнопкой перехода на оригинал.
