import os, random, psycopg2
from datetime import datetime, timezone
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

app = Flask(__name__, template_folder="templates", static_folder="static", static_url_path="/static")
CORS(app)
app.json.ensure_ascii = False

class DBConnection:
    def __init__(self): self.conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    def execute(self, q, p=None):
        cur = self.conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(q, p)
        return cur
    def commit(self): self.conn.commit()
    def rollback(self): self.conn.rollback()
    def close(self): self.conn.close()

def db(): return DBConnection()

BASE_TAP_COOLDOWN, BASE_ENERGY_MAX, BASE_REGEN_COOLDOWN, BASE_TAP_REWARD, X5_CHANCE = 1.0, 100, 2.0, 1.0, 0.10
LEVEL_COLUMNS_ALL = {"tap_cd": "tap_cd_level", "income": "income_level", "energy": "energy_level", "regen": "regen_level", "double": "double_level", "multiplier": "multiplier_level", "gem_income": "gem_income_level"}
UPGRADE_CURRENCIES = {"tap_cd": "dollars", "income": "dollars", "energy": "dollars", "regen": "dollars", "double": "gems", "multiplier": "gems", "gem_income": "gems"}

def get_upgrade_cost(k, l):
    if k == "tap_cd": return 10 * (1.8 ** l)
    if k == "income": return 15 * (1.5 ** l)
    if k == "energy": return 20 * (1.4 ** l)
    if k == "regen": return 25 * (1.6 ** l)
    if k == "double": return 25 * (3 ** l)
    if k == "multiplier": return 50 * (2 ** l)
    if k == "gem_income": return 100 * (1.8 ** l)
    return 999999

def upgrade_max_level(k): return 19 if k == "tap_cd" else None
def now(): return datetime.now(timezone.utc).timestamp()

def init_db():
    url = os.getenv("DATABASE_URL")
    if not url: return
    try:
        conn = db()
        conn.execute("CREATE TABLE IF NOT EXISTS players (user_id TEXT PRIMARY KEY, username TEXT DEFAULT 'Player', dollars REAL DEFAULT 0, gems REAL DEFAULT 0, energy REAL DEFAULT 100, last_energy_at DOUBLE PRECISION DEFAULT 0, last_tap_at DOUBLE PRECISION DEFAULT 0, last_daily DOUBLE PRECISION DEFAULT 0, tap_cd_level INTEGER DEFAULT 0, income_level INTEGER DEFAULT 0, energy_level INTEGER DEFAULT 0, regen_level INTEGER DEFAULT 0, double_level INTEGER DEFAULT 0, multiplier_level INTEGER DEFAULT 0, gem_income_level INTEGER DEFAULT 0, referrals INTEGER DEFAULT 0)")
        conn.execute("ALTER TABLE players ALTER COLUMN last_energy_at TYPE DOUBLE PRECISION")
        conn.execute("ALTER TABLE players ALTER COLUMN last_tap_at TYPE DOUBLE PRECISION")
        conn.execute("ALTER TABLE players ALTER COLUMN last_daily TYPE DOUBLE PRECISION")
        conn.commit(); conn.close()
    except Exception as e: print("DB INIT ERROR:", repr(e))

def get_player(uid, uname="Player"):
    conn = db()
    try:
        row = conn.execute("SELECT * FROM players WHERE user_id=%s", (str(uid),)).fetchone()
        if row is None:
            t = now()
            conn.execute("INSERT INTO players(user_id, username, energy, last_energy_at, last_tap_at) VALUES(%s, %s, %s, %s, %s)", (str(uid), uname or "Player", BASE_ENERGY_MAX, t, 0))
            conn.commit()
            row = conn.execute("SELECT * FROM players WHERE user_id=%s", (str(uid),)).fetchone()
        return row
    finally: conn.close()

def regen_energy(row):
    max_eng = BASE_ENERGY_MAX * (1.5 ** row["energy_level"])
    cd = 1.0
    elapsed = max(0, now() - row["last_energy_at"])
    ticks = int(elapsed / cd)
    if ticks <= 0: return row, max_eng, cd
    new_eng = min(max_eng, row["energy"] + (ticks * (1 + row["regen_level"])))
    new_last = now() - (elapsed - ticks * cd)
    conn = db()
    try:
        conn.execute("UPDATE players SET energy=%s, last_energy_at=%s WHERE user_id=%s", (new_eng, new_last, row["user_id"]))
        conn.commit()
    finally: conn.close()
    return get_player(row["user_id"]), max_eng, cd

def serialize(row):
    row, max_eng, regen_cd = regen_energy(row)
    return {
        "user_id": row["user_id"], "username": row["username"], "dollars": round(row["dollars"], 4), "gems": round(row["gems"], 4), "energy": round(row["energy"], 2), "max_energy": round(max_eng, 2), "regen_cd": round(regen_cd, 2),
        "tap_cd": round(max(0.05, BASE_TAP_COOLDOWN - 0.05 * row["tap_cd_level"]), 2), "tap_reward": round(BASE_TAP_REWARD * (1.33 ** row["income_level"]), 4), "x5_chance": X5_CHANCE,
        "tap_cd_level": row["tap_cd_level"], "income_level": row["income_level"], "energy_level": row["energy_level"], "regen_level": row["regen_level"], "double_level": row["double_level"], "double_chance": min(0.50, 0.01 * row["double_level"]),
        "multiplier_level": row["multiplier_level"], "income_multiplier": round(1.0 + (0.05 * row["multiplier_level"]), 2), "gem_income_level": row["gem_income_level"], "gem_chance": min(0.40, 0.15 + 0.03 * row["gem_income_level"]), "referrals": row["referrals"]
    }

init_db()

@app.get("/")
def index(): return render_template("index.html")

@app.get("/api/state")
def state():
    uid, uname = str(request.args.get("user_id", "local-demo")), request.args.get("username", "Player")
    return jsonify({"ok": True, "player": serialize(get_player(uid, uname))})

@app.get("/api/leaderboard")
def get_leaderboard():
    conn = db()
    try:
        rows = conn.execute("SELECT user_id, username, dollars FROM players ORDER BY dollars DESC").fetchall()
        leaderboard = [{"rank": i + 1, "user_id": r["user_id"], "username": r["username"] or "Player", "dollars": round(r["dollars"], 2)} for i, r in enumerate(rows)]
        return jsonify({"ok": True, "leaderboard": leaderboard})
    except Exception as e: return jsonify({"ok": False, "error": str(e)})
    finally: conn.close()

@app.get("/api/upgrades")
def upgrades():
    row = get_player(str(request.args.get("user_id", "local-demo")))
    res = {}
    for k in LEVEL_COLUMNS_ALL.keys():
        lvl = row[LEVEL_COLUMNS_ALL[k]]
        mx = upgrade_max_level(k)
        res[k] = {"level": lvl, "cost": round(get_upgrade_cost(k, lvl), 2), "currency": UPGRADE_CURRENCIES[k], "max_level": mx, "maxed": (mx is not None and lvl >= mx)}
    return jsonify({"ok": True, "upgrades": res})

@app.post("/api/upgrades/buy")
def buy_upgrade():
    data = request.json or {}
    uid, kind, buy_max = str(data.get("user_id", "local-demo")), data.get("kind", ""), bool(data.get("max", False))
    if kind not in LEVEL_COLUMNS_ALL: return jsonify({"ok": False, "error": "unknown_upgrade"})
    row = get_player(uid)
    col = LEVEL_COLUMNS_ALL[kind]
    if kind == "tap_cd" and row[col] >= 19: return jsonify({"ok": False, "error": "max_level"})
    conn = db()
    try:
        if buy_max:
            while True:
                if kind == "tap_cd" and row[col] >= 19: break
                cost = get_upgrade_cost(kind, row[col])
                bal = row["dollars"] if UPGRADE_CURRENCIES[kind] == "dollars" else row["gems"]
                if bal < cost: break
                conn.execute(f"UPDATE players SET {UPGRADE_CURRENCIES[kind]} = {UPGRADE_CURRENCIES[kind]} - %s, {col} = {col} + 1 WHERE user_id = %s", (cost, uid))
                conn.commit(); row = get_player(uid)
        else:
            cost = get_upgrade_cost(kind, row[col])
            bal = row["dollars"] if UPGRADE_CURRENCIES[kind] == "dollars" else row["gems"]
            if bal < cost: return jsonify({"ok": False, "error": "no_money"})
            conn.execute(f"UPDATE players SET {UPGRADE_CURRENCIES[kind]} = {UPGRADE_CURRENCIES[kind]} - %s, {col} = {col} + 1 WHERE user_id = %s", (cost, uid))
            conn.commit()
        return jsonify({"ok": True, "player": serialize(get_player(uid))})
    except Exception as e: conn.rollback(); return jsonify({"ok": False, "error": str(e)})
    finally: conn.close()

@app.post("/api/tap")
def tap():
    data = request.json or {}
    uid, uname = str(data.get("user_id", "local-demo")), data.get("username", "Player")
    row, _, _ = regen_energy(get_player(uid, uname))
    curr = now()
    cd = max(0.05, BASE_TAP_COOLDOWN - 0.05 * row["tap_cd_level"])
    if curr - row["last_tap_at"] < cd: return jsonify({"ok": False, "error": "cooldown", "remaining": cd - (curr - row["last_tap_at"])})
    if row["energy"] <= 0: return jsonify({"ok": False, "error": "energy"})
    
    base_tap_reward = BASE_TAP_REWARD * (1.33 ** row["income_level"])
    energy_cost = max(1.0, base_tap_reward / 5.0)
    ratio = 1.0; actual_energy_spent = energy_cost
    if row["energy"] < energy_cost:
        actual_energy_spent = row["energy"]
        ratio = actual_energy_spent / energy_cost

    reward = (base_tap_reward * (1.0 + (0.05 * row["multiplier_level"]))) * ratio
    is_x5, is_double, is_gem = random.random() < X5_CHANCE, random.random() < min(0.50, 0.01 * row["double_level"]), random.random() < min(0.40, 0.15 + 0.03 * row["gem_income_level"])
    if is_x5: reward *= 5
    elif is_double: reward *= 2
    
    conn = db()
    try:
        conn.execute("UPDATE players SET dollars=dollars+%s, gems=gems+%s, energy=energy-%s, last_tap_at=%s, last_energy_at=%s WHERE user_id=%s", (reward, 1.0 if is_gem else 0.0, actual_energy_spent, curr, curr, uid))
        conn.commit()
    except Exception as e: conn.rollback(); return jsonify({"ok": False, "error": str(e)})
    finally: conn.close()
    return jsonify({"ok": True, "player": serialize(get_player(uid)), "reward": reward, "x5": is_x5, "doubled": is_double, "gem_drop": is_gem, "tap_cd": cd})

if __name__ == "__main__":
    app.run(debug=True)
