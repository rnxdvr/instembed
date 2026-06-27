# Instagram/Reels Embed Generator для GitHub Pages

Это статический сайт-сервис для GitHub Pages.

Он делает не автоматический Instagram iframe, а стабильную локальную preview-карточку:

- отдельная ссылка на embed-страницу;
- iframe-код для вставки на сайт;
- карточка с автором, описанием, обложкой и кнопкой «Открыть в Instagram»;
- поддержка `instagram.com` и `kkinstagram.com`;
- без PHP, Node.js и серверной части.

## Структура

```text
index.html                  # генератор ссылок и iframe-кода
embed.html                  # сама embed-карточка по query-параметрам
embed.css                   # стили сайта и карточки
instagram-embeds.json       # локальная база метаданных по shortcode, опционально
.nojekyll                   # чтобы GitHub Pages не пытался обрабатывать файлы Jekyll
assets/ig/                  # сюда можно класть обложки
/e/DYikItvvxgP/index.html   # пример статической страницы с OG meta
```

## Деплой на GitHub Pages

1. Создай репозиторий, например `ig-embed`.
2. Загрузи в него все файлы из архива.
3. Открой `Settings` → `Pages`.
4. В `Build and deployment` выбери `Deploy from a branch`.
5. Branch: `main`, folder: `/root`.
6. Открой сайт вида:

```text
https://USERNAME.github.io/ig-embed/
```

## Как пользоваться

Открываешь главную страницу сайта:

```text
https://USERNAME.github.io/ig-embed/
```

Вставляешь ссылку:

```text
https://www.kkinstagram.com/reel/DYikItvvxgP/
```

При желании заполняешь:

- автора;
- описание;
- ссылку на обложку.

Получаешь:

1. готовую ссылку на embed;
2. iframe-код;
3. простую HTML-ссылку.

## Пример прямой embed-ссылки

```text
https://USERNAME.github.io/ig-embed/embed.html?u=https%3A%2F%2Fwww.kkinstagram.com%2Freel%2FDYikItvvxgP%2F&author=Instagram%20Reel&caption=Preview
```

## Пример iframe

```html
<iframe src="https://USERNAME.github.io/ig-embed/embed.html?u=https%3A%2F%2Fwww.kkinstagram.com%2Freel%2FDYikItvvxgP%2F&author=Instagram%20Reel&caption=Preview" width="430" height="650" style="border:0;max-width:100%;border-radius:24px;overflow:hidden;" loading="lazy" title="Instagram preview"></iframe>
```

## Как добавить обложку

Положи файл:

```text
assets/ig/DYikItvvxgP.jpg
```

И укажи в генераторе:

```text
assets/ig/DYikItvvxgP.jpg
```

Или пропиши в `instagram-embeds.json`:

```json
{
  "DYikItvvxgP": {
    "author": "@username",
    "caption": "Описание ролика",
    "cover": "assets/ig/DYikItvvxgP.jpg",
    "url": "https://www.instagram.com/reel/DYikItvvxgP/"
  }
}
```

Тогда можно давать короткую ссылку только с `u=...`, а автор/описание/обложка подтянутся из JSON.

## Важное ограничение GitHub Pages

GitHub Pages — это статический хостинг. Он не может на лету сходить на Instagram, скачать первый кадр, обойти CORS или сгенерировать разные server-side meta-теги для каждой query-ссылки.

Поэтому есть два режима:

### 1. Embed/iframe для сайтов

Работает сразу через:

```text
embed.html?u=...
```

Это нормальный вариант для вставки на сайт через iframe.

### 2. Красивое превью в Telegram/Discord/iMessage

Для мессенджеров query-страница не идеальна, потому что боты обычно читают HTML meta-теги и не выполняют JavaScript.

Для красивого превью в мессенджерах нужно делать статическую страницу на каждый ролик, например:

```text
/e/DYikItvvxgP/index.html
```

Внутри такой страницы вручную меняются:

- `<title>`;
- `meta description`;
- `og:title`;
- `og:description`;
- `og:image`, если есть обложка;
- ссылка на оригинальный Instagram.

Пример такой страницы уже лежит в архиве.
