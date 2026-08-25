import os
import random
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

# Явно прописываем пути к папкам для хостинга Render
app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="/static"
)
CORS(app)

# Отключаем ASCII: Flask будет отдавать чистый UTF-8
app.json.ensure_ascii = False

# =========================
# DATABASE
# =========================
class DBConnection:
    def __init__(self):
        self.conn = psycopg2.connect(os.getenv("DATABASE_URL"))

    def execute(self, query, params=None):
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, params)
        return cursor

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

def db():
    return DBConnection()

# =========================
# GAME CONSTANTS & UPGRADES
# =========================
BASE_TAP_COOLDOWN = 1.0
BASE_ENERGY_MAX = 100
BASE_REGEN_COOLDOWN = 2.0
BASE_TAP_REWARD = 1.0
X5_CHANCE = 0.10

# Маппинг прокачек на колонки в базе данных
LEVEL_COLUMNS = {
    "tap_cd": "tap_cd_level",
    "income": "income_level",
    "energy": "energy_level",
    "regen": "regen_level"
}

# Функции расчета стоимости апгрейдов в зависимости от текущего уровня
UPGRADE_COSTS = {
    "tap_cd": lambda row: 10 * (1.8 ** row["tap_cd_level"]),
    "income": lambda row: 15 * (1.5 ** row["income_level"]),
    "energy": lambda row: 20 * (1.4 ** row["energy_level"]),
    "regen": lambda row: 25 * (1.6 ** row["regen_level"])
}

def upgrade_currency(kind):
    return "dollars"

def upgrade_max_level(kind):
    if kind == "tap_cd":
        return 19  # Чтобы кулдаун не ушел в ноль или минус
    return None

# =========================
# DATABASE INIT
# =========================
def init_db():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("CRITICAL WARNING: DATABASE_URL variable is missing in settings!")
        return
        
    try:
        conn = db()
        conn.execute("""
        CREATE TABLE IF NOT EXISTS players (
            user_id TEXT PRIMARY KEY,
            username TEXT DEFAULT 'Player',
            dollars REAL DEFAULT 0,
            gems REAL DEFAULT 0,
            energy REAL DEFAULT 100,
            last_energy_at REAL DEFAULT 0,
            last_tap_at REAL DEFAULT 0,
            last_daily REAL DEFAULT 0,
            tap_cd_level INTEGER DEFAULT 0,
            income_level INTEGER DEFAULT 0,
            energy_level INTEGER DEFAULT 0,
            regen_level INTEGER DEFAULT 0,
            double_level INTEGER DEFAULT 0,
            multiplier_level INTEGER DEFAULT 0,
            gem_income_level INTEGER DEFAULT 0,
            referrals INTEGER DEFAULT 0
        )
        """)
        conn.commit()
        conn.close()
        print("Database successfully initialized.")
    except Exception as e:
        print("DATABASE INIT ERROR:", repr(e))

# Время строго возвращает независимый UTC Unix Timestamp
def now():
    return datetime.now(timezone.utc).timestamp()

# =========================
# PLAYER
# =========================
def get_player(user_id, username="Player"):
    conn = db()
    try:
        row = conn.execute("SELECT * FROM players WHERE user_id=%s", (str(user_id),)).fetchone()

        if row is None:
            t = now()
            conn.execute("""
                INSERT INTO players(user_id, username, energy, last_energy_at, last_tap_at)
                VALUES(%s, %s, %s, %s, %s)
            """, (str(user_id), username or "Player", BASE_ENERGY_MAX, t, 0))
            conn.commit()
            row = conn.execute("SELECT * FROM players WHERE user_id=%s", (str(user_id),)).fetchone()
        return row
    finally:
        conn.close()

# =========================
# ENERGY REGEN
# =========================
def regen_energy(row):
    max_energy = BASE_ENERGY_MAX * (1.5 ** row["energy_level"])
    cooldown = max(0.10, BASE_REGEN_COOLDOWN - 0.10 * row["regen_level"])
    current = row["energy"]
    current_time = now()

    elapsed = max(0, current_time - row["last_energy_at"])
    gained = int(elapsed / cooldown)

    if gained <= 0:
        return row, max_energy, cooldown

    new_energy = min(max_energy, current + gained)
    remainder = elapsed - gained * cooldown
    new_last = current_time - remainder

    conn = db()
    try:
        conn.execute("""
            UPDATE players SET energy=%s, last_energy_at=%s WHERE user_id=%s
        """, (new_energy, new_last, row["user_id"]))
        conn.commit()
    finally:
        conn.close()

    return get_player(row["user_id"]), max_energy, cooldown

# =========================
# GAME LOGIC CALCULATIONS
# =========================
def tap_cooldown(row):
    return max(0.05, BASE_TAP_COOLDOWN - 0.05 * row["tap_cd_level"])

def tap_reward(row):
    return BASE_TAP_REWARD * (1.33 ** row["income_level"])

def double_chance(row):
    return min(0.50, 0.01 * row["double_level"])

def income_multiplier(row):
    return 1.0 + (0.05 * row["multiplier_level"])

def gem_chance(row):
    return min(0.40, 0.15 + 0.03 * row["gem_income_level"])

# =========================
# SERIALIZE
# =========================
def serialize(row):
    row, max_energy, regen_cd = regen_energy(row)
    return {
        "user_id": row["user_id"],
        "username": row["username"],
        "dollars": round(row["dollars"], 4),
        "gems": round(row["gems"], 4),
        "energy": round(row["energy"], 2),
        "max_energy": round(max_energy, 2),
        "regen_cd": round(regen_cd, 2),
        "tap_cd": round(tap_cooldown(row), 2),
        "tap_reward": round(tap_reward(row), 4),
        "x5_chance": X5_CHANCE,
        "tap_cd_level": row["tap_cd_level"],
        "income_level": row["income_level"],
        "energy_level": row["energy_level"],
        "regen_level": row["regen_level"],
        "double_level": row["double_level"],
        "double_chance": double_chance(row),
        "multiplier_level": row["multiplier_level"],
        "income_multiplier": round(income_multiplier(row), 2),
        "gem_income_level": row["gem_income_level"],
        "gem_chance": gem_chance(row),
        "referrals": row["referrals"]
    }

init_db()

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/state")
def state():
    user_id = str(request.args.get("user_id", "local-demo"))
    username = request.args.get("username", "Player")
    player = get_player(user_id, username)
    return jsonify({"ok": True, "player": serialize(player)})

# =========================
# UPGRADES API
# =========================
@app.get("/api/upgrades")
def upgrades():
    user_id = str(request.args.get("user_id", "local-demo"))
    row = get_player(user_id)
    result = {}
    for kind, cost_func in UPGRADE_COSTS.items():
        level_col = LEVEL_COLUMNS[kind]
        result[kind] = {
            "level": row[level_col],
            "cost": round(cost_func(row), 2),
            "currency": upgrade_currency(kind),
            "max_level": upgrade_max_level(kind),
            "maxed": (upgrade_max_level(kind) is not None and row[level_col] >= upgrade_max_level(kind))
        }
    return jsonify({"ok": True, "upgrades": result})

# =========================
# TAP API
# =========================
@app.post("/api/tap")
def tap():
    data = request.json or {}
    user_id = str(data.get("user_id", "local-demo"))
    username = data.get("username", "Player")
    
    row = get_player(user_id, username)
    row, max_energy, _ = regen_energy(row)
    
    current_time = now()
    
    # 1. Проверка кулдауна тапа
    cd = tap_cooldown(row)
    if current_time - row["last_tap_at"] < cd:
        remaining = cd - (current_time - row["last_tap_at"])
        return jsonify({"ok": False, "error": "cooldown", "remaining": remaining})
        
    # 2. Проверка энергии
    if row["energy"] < 1:
        return jsonify({"ok": False, "error": "energy"})
        
    # 3. Расчет награды
    reward = tap_reward(row) * income_multiplier(row)
    
    # Бонусы (X5, Double, Gem Drop)
    is_x5 = random.random() < X5_CHANCE
    is_doubled = random.random() < double_chance(row)
    is_gem_drop = random.random() < gem_chance(row)
    
    if is_x5:
        reward *= 5
    elif is_doubled:
        reward *= 2
        
    new_dollars = row["dollars"] + reward
    new_gems = row["gems"] + (1.0 if is_gem_drop else 0.0)
    new_energy = row["energy"] - 1
    
    # 4. Обновление в базе
    conn = db()
    try:
        conn.execute("""
            UPDATE players 
            SET dollars=%s, gems=%s, energy=%s, last_tap_at=%s, last_energy_at=%s 
            WHERE user_id=%s
        """, (new_dollars, new_gems, new_energy, current_time, current_time, user_id))
        conn.commit()
    finally:
        conn.close()
        
    updated_player = get_player(user_id)
    return jsonify({
        "ok": True,
        "player": serialize(updated_player),
        "reward": reward,
        "x5": is_x5,
        "doubled": is_doubled,
        "gem_drop": is_gem_drop,
        "tap_cd": cd
    })

if __name__ == "__main__":
    app.run(debug=True)
