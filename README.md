# 8OLLAR Telegram Mini App — учебная версия

## Что внутри
- Flask backend
- SQLite база `game.db`
- Telegram Mini App интерфейс
- Тап по всему экрану
- 8OLLAR + G3MS
- энергия и регенерация
- 4 основные прокачки
- G3MS-меню
- double tap, x5 и multiplier
- профиль и рейтинг
- сохранение прогресса

## Запуск на ПК

1. Установить Python 3.10+.
2. Открыть терминал в папке проекта.
3. Установить зависимости:

    pip install -r requirements.txt

4. Запустить приложение:

    python app.py

Оно откроется локально на `http://127.0.0.1:5000`.

## Telegram

Для реального Telegram Mini App понадобится HTTPS-адрес. Локальный `http://127.0.0.1:5000` Telegram как Mini App не примет. После локального теста можно подключить HTTPS-туннель или хостинг.

Для бота:
- `BOT_TOKEN` — токен BotFather
- `MINI_APP_URL` — публичный HTTPS URL приложения

Бот запускается отдельным процессом:

    python bot.py

## Важно
Токен не помещать в GitHub и не писать прямо в исходниках.
