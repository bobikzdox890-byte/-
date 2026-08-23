import os
import requests

TOKEN = os.getenv("BOT_TOKEN", "")
MINI_APP_URL = os.getenv("MINI_APP_URL", "")

if not TOKEN:
    raise SystemExit("Set BOT_TOKEN environment variable first.")
if not MINI_APP_URL:
    raise SystemExit("Set MINI_APP_URL environment variable first.")

offset = 0

def send_message(chat_id, text):
    keyboard = {
        "inline_keyboard": [[
            {
                "text": "🎮 Открыть тапалку",
                "web_app": {"url": MINI_APP_URL}
            }
        ]]
    }
    requests.post(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": text,
            "reply_markup": keyboard
        },
        timeout=30
    )

while True:
    data = requests.get(
        f"https://api.telegram.org/bot{TOKEN}/getUpdates",
        params={"offset": offset, "timeout": 30},
        timeout=40
    ).json()

    for update in data.get("result", []):
        offset = update["update_id"] + 1
        message = update.get("message")
        if not message:
            continue

        chat_id = message["chat"]["id"]
        text = message.get("text", "")

        if text == "/start":
            send_message(
                chat_id,
                "🎮 Добро пожаловать!\n\n"
                "Открывай тапалку кнопкой ниже."
            )
