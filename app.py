import os
import random
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

# Явно прописываем пути к папкам для хостинга Render, чтобы он не выводил README.md
app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static",
    static_url_path="/static"
)
CORS(app)

# Принудительно отключаем ASCII: Flask будет отдавать чистый UTF-8 без иероглифов на Render
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
# GAME CONSTANTS
# =========================
BASE_TAP_COOLDOWN = 1.0
BASE_ENERGY_MAX = 100
BASE_REGEN_COOLDOWN = 2.0
BASE_TAP_REWARD = 1
X5_CHANCE = 0.10

# =========================
# DATABASE INIT (Защищенная версия)
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
# ENERGY
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
# GAME LOGIC
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
# TAP
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


@app.get("/api/upgrades")
def upgrades():
    user_id = str(request.args.get("user_id", "local-demo"))
    row = get_player(user_id)
    result = {}
    for kind, cost_func in UPGRADE_COSTS.items():
        level_col = LEVEL_COLUMNS[kind]
        level = row[level_col]
        max_level = upgrade_max_level(kind)
        result[kind] = {
            "level": level,
        
