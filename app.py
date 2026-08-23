import os
import time
import random
import psycopg2
from psycopg2.extras import RealDictCursor

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS


app = Flask(__name__)
CORS(app)


# =========================
# DATABASE
# =========================

class DBConnection:

    def __init__(self):
        self.conn = psycopg2.connect(
            os.getenv("DATABASE_URL")
        )

    def execute(self, query, params=None):
        cursor = self.conn.cursor(
            cursor_factory=RealDictCursor
        )

        cursor.execute(
            query,
            params
        )

        return cursor

    def commit(self):
        self.conn.commit()

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

X5_CHANCE = 0.05


# =========================
# DATABASE INIT
# =========================

def init_db():

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


def now():
    return time.time()


def get_player(user_id, username="Player"):

    conn = db()

    row = conn.execute(
        """
        SELECT *
        FROM players
        WHERE user_id=%s
        """,
        (str(user_id),)
    ).fetchone()

    if row is None:

        t = now()

        conn.execute(
            """
            INSERT INTO players(
                user_id,
                username,
                energy,
                last_energy_at,
                last_tap_at
            )
            VALUES(%s, %s, %s, %s, %s)
            """,
            (
                str(user_id),
                username or "Player",
                BASE_ENERGY_MAX,
                t,
                0
            )
        )

        conn.commit()

        row = conn.execute(
            """
            SELECT *
            FROM players
            WHERE user_id=%s
            """,
            (str(user_id),)
        ).fetchone()

    conn.close()

    return row


# =========================
# ENERGY
# =========================

def regen_energy(row):

    max_energy = BASE_ENERGY_MAX * (
        1.5 ** row["energy_level"]
    )

    cooldown = max(
        0.10,
        BASE_REGEN_COOLDOWN
        - 0.10 * row["regen_level"]
    )

    current = row["energy"]

    elapsed = max(
        0,
        now() - row["last_energy_at"]
    )

    gained = int(elapsed / cooldown)

    if gained <= 0:
        return row, max_energy, cooldown

    new_energy = min(
        max_energy,
        current + gained
    )

    remainder = (
        elapsed
        - gained * cooldown
    )

    new_last = now() - remainder

    conn = db()

    conn.execute(
        """
        UPDATE players
        SET
            energy=%s,
            last_energy_at=%s
        WHERE user_id=%s
        """,
        (
            new_energy,
            new_last,
            row["user_id"]
        )
    )

    conn.commit()
    conn.close()

    row = get_player(
        row["user_id"]
    )

    return row, max_energy, cooldown


# =========================
# UPGRADES / GAME LOGIC
# =========================

def tap_cooldown(row):

    return max(
        0.05,
        BASE_TAP_COOLDOWN
        - 0.05 * row["tap_cd_level"]
    )


def tap_reward(row):

    return BASE_TAP_REWARD * (
        1.10 ** row["income_level"]
    )


def double_chance(row):

    return min(
        0.50,
        0.01 * row["double_level"]
    )


def income_multiplier(row):

    return 1.0 + (
        0.05 * row["multiplier_level"]
    )


def gem_chance(row):

    return min(
        0.40,
        0.15
        + 0.03 * row["gem_income_level"]
    )


# =========================
# SERIALIZE PLAYER
# =========================

def serialize(row):

    row, max_energy, regen_cd = regen_energy(row)

    return {

        "user_id":
            row["user_id"],

        "username":
            row["username"],

        "dollars":
            round(
                row["dollars"],
                4
            ),

        "gems":
            round(
                row["gems"],
                4
            ),

        "energy":
            round(
                row["energy"],
                2
            ),

        "max_energy":
            round(
                max_energy,
                2
            ),

        "regen_cd":
            round(
                regen_cd,
                2
            ),

        "tap_cd":
            round(
                tap_cooldown(row),
                2
            ),

        "tap_reward":
            round(
                tap_reward(row),
                4
            ),

        "x5_chance":
            X5_CHANCE,

        "tap_cd_level":
            row["tap_cd_level"],

        "income_level":
            row["income_level"],

        "energy_level":
            row["energy_level"],

        "regen_level":
            row["regen_level"],

        "double_level":
            row["double_level"],

        "double_chance":
            double_chance(row),

        "multiplier_level":
            row["multiplier_level"],

        "income_multiplier":
            round(
                income_multiplier(row),
                2
            ),

        "gem_income_level":
            row["gem_income_level"],

        "gem_chance":
            gem_chance(row),

        "referrals":
            row["referrals"]
    }


# =========================
# START DATABASE
# =========================

init_db()


# =========================
# MAIN PAGE
# =========================

@app.get("/")
def index():

    return render_template(
        "index.html"
    )


# =========================
# STATE
# =========================

@app.get("/api/state")
def state():

    user_id = request.args.get(
        "user_id",
        "local-demo"
    )

    username = request.args.get(
        "username",
        "Player"
    )

    player = get_player(
        user_id,
        username
    )

    return jsonify({
        "ok": True,
        "player": serialize(player)
    })


# =========================
# TAP
# =========================

@app.post("/api/tap")
def tap():

    payload = request.get_json(
        silent=True
    ) or {}

    user_id = str(
        payload.get(
            "user_id",
            "local-demo"
        )
    )

    username = payload.get(
        "username",
        "Player"
    )

    row = get_player(
        user_id,
        username
    )

    row, max_energy, _ = regen_energy(row)

    cd = tap_cooldown(row)

    elapsed = (
        now()
        - row["last_tap_at"]
    )

    if elapsed < cd:

        return jsonify({
            "ok": False,
            "error": "cooldown",
            "remaining": round(
                cd - elapsed,
                2
            )
        }), 429

    if row["energy"] < 1:

        return jsonify({
            "ok": False,
            "error": "energy"
        }), 400

    reward = tap_reward(row)

    bonus = 1

    doubled = (
        random.random()
        < double_chance(row)
    )

    if doubled:
        bonus *= 2

    x5 = (
        random.random()
        < X5_CHANCE
    )

    if x5:
        bonus *= 5

    reward *= (
        income_multiplier(row)
        * bonus
    )

    gem_drop = (
        random.random()
        < gem_chance(row)
    )

    new_gems = (
        row["gems"]
        + (1 if gem_drop else 0)
    )

    conn = db()

    conn.execute(
        """
        UPDATE players
        SET
            dollars=dollars+%s,
            gems=%s,
            energy=energy-1,
            last_tap_at=%s
        WHERE user_id=%s
        """,
        (
            reward,
            new_gems,
            now(),
            user_id
        )
    )

    conn.commit()
    conn.close()

    row = get_player(
        user_id
    )

    return jsonify({

        "ok": True,

        "reward":
            round(
                reward,
                4
            ),

        "gem_drop":
            gem_drop,

        "doubled":
            doubled,

        "x5":
            x5,

        "player":
            serialize(row)
    })


# =========================
# UPGRADE COSTS
# =========================

UPGRADE_COSTS = {

    "tap_cd":
        lambda r:
        10 * (
            1.75
            ** r["tap_cd_level"]
        ),

    "income":
        lambda r:
        15 * (
            1.35
            ** r["income_level"]
        ),

    "energy":
        lambda r:
        200 * (
            1.70
            ** r["energy_level"]
        ),

    "regen":
        lambda r:
        100 * (
            1.65
            ** r["regen_level"]
        ),

    "double":
        lambda r:
        25 * (
            3
            ** r["double_level"]
        ),

    "multiplier":
        lambda r:
        50 * (
            2
            ** r["multiplier_level"]
        ),

    "gem_income":
        lambda r:
        100 * (
            1.8
            ** r["gem_income_level"]
        )
}


# =========================
# LEVEL COLUMNS
# =========================

LEVEL_COLUMNS = {

    "tap_cd":
        "tap_cd_level",

    "income":
        "income_level",

    "energy":
        "energy_level",

    "regen":
        "regen_level",

    "double":
        "double_level",

    "multiplier":
        "multiplier_level",

    "gem_income":
        "gem_income_level"
}


# =========================
# UPGRADE CURRENCY
# =========================

def upgrade_currency(kind):

    if kind in {
        "double",
        "multiplier"
    }:
        return "gems"

    return "dollars"


# =========================
# MAX LEVEL
# =========================

def upgrade_max_level(kind):

    if kind == "tap_cd":
        return 20

    if kind == "double":
        return 50

    if kind == "regen":
        return 99

    return None


# =========================
# GET UPGRADES
# =========================

@app.get("/api/upgrades")
def upgrades():

    user_id = str(
        request.args.get(
            "user_id",
            "local-demo"
        )
    )

    row = get_player(
        user_id
    )

    result = {}

    for kind, cost_func in UPGRADE_COSTS.items():

        level_col = LEVEL_COLUMNS[kind]

        level = row[level_col]

        max_level = upgrade_max_level(
            kind
        )

        result[kind] = {

            "level":
                level,

            "cost":
                round(
                    cost_func(row),
                    2
                ),

            "currency":
                upgrade_currency(kind),

            "max_level":
                max_level,

            "maxed":
                (
                    max_level is not None
                    and level >= max_level
                )
        }

    return jsonify({
        "ok": True,
        "upgrades": result
    })


# =========================
# BUY ONE UPGRADE
# =========================

@app.post("/api/upgrade")
def upgrade():

    payload = request.get_json(
        silent=True
    ) or {}

    user_id = str(
        payload.get(
            "user_id",
            "local-demo"
        )
    )

    kind = payload.get(
        "kind"
    )

    if kind not in UPGRADE_COSTS:

        return jsonify({
            "ok": False,
            "error": "unknown upgrade"
        }), 400

    row = get_player(
        user_id
    )

    level_col = LEVEL_COLUMNS[kind]

    currency = upgrade_currency(
        kind
    )

    max_level = upgrade_max_level(
        kind
    )

    current_level = row[
        level_col
    ]

    if (
        max_level is not None
        and current_level >= max_level
    ):

        return jsonify({
            "ok": False,
            "error": "max_level"
        }), 400

    cost = UPGRADE_COSTS[kind](
        row
    )

    balance = row[
        currency
    ]

    if balance < cost:

        return jsonify({
            "ok": False,
            "error": "money",
            "cost": round(
                cost,
                2
            ),
            "currency": currency
        }), 400

    conn = db()

    conn.execute(
        f"""
        UPDATE players
        SET
            {currency}={currency}-%s,
            {level_col}={level_col}+1
        WHERE user_id=%s
        """,
        (
            cost,
            user_id
        )
    )

    conn.commit()
    conn.close()

    return jsonify({

        "ok": True,

        "cost":
            round(
                cost,
                2
            ),

        "player":
            serialize(
                get_player(user_id)
            )
    })


# =========================
# BUY MAX
# =========================

@app.post("/api/upgrade_max")
def upgrade_max():

    payload = request.get_json(
        silent=True
    ) or {}

    user_id = str(
        payload.get(
            "user_id",
            "local-demo"
        )
    )

    kind = payload.get(
        "kind"
    )

    if kind not in UPGRADE_COSTS:

        return jsonify({
            "ok": False,
            "error": "unknown upgrade"
        }), 400

    row = get_player(
        user_id
    )

    level_col = LEVEL_COLUMNS[kind]

    currency = upgrade_currency(
        kind
    )

    max_level = upgrade_max_level(
        kind
    )

    levels_bought = 0

    while True:

        row = get_player(
            user_id
        )

        current_level = row[
            level_col
        ]

        if (
            max_level is not None
            and current_level >= max_level
        ):
            break

        cost = UPGRADE_COSTS[kind](
            row
        )

        if row[currency] < cost:
            break

        conn = db()

        conn.execute(
            f"""
            UPDATE players
            SET
                {currency}={currency}-%s,
                {level_col}={level_col}+1
            WHERE user_id=%s
            """,
            (
                cost,
                user_id
            )
        )

        conn.commit()
        conn.close()

        levels_bought += 1

    row = get_player(
        user_id
    )

    if levels_bought == 0:

        current_level = row[
            level_col
        ]

        if (
            max_level is not None
            and current_level >= max_level
        ):

            return jsonify({
                "ok": False,
                "error": "max_level"
            }), 400

        cost = UPGRADE_COSTS[kind](
            row
        )

        return jsonify({
            "ok": False,
            "error": "money",
            "cost": round(
                cost,
                2
            ),
            "currency": currency
        }), 400

    return jsonify({

        "ok": True,

        "levels_bought":
            levels_bought,

        "player":
            serialize(row)
    })


# =========================
# REFERRALS
# =========================

@app.get("/api/referrals")
def referrals():

    user_id = str(
        request.args.get(
            "user_id",
            "local-demo"
        )
    )

    row = get_player(
        user_id
    )

    return jsonify({

        "ok": True,

        "referrals":
            row["referrals"],

        "code":
            f"ref_{user_id}"
    })


# =========================
# REFERRAL REWARD
# =========================

@app.post("/api/referral")
def referral():

    payload = request.get_json(
        silent=True
    ) or {}

    user_id = str(
        payload.get(
            "user_id",
            "local-demo"
        )
    )

    get_player(
        user_id
    )

    conn = db()

    conn.execute(
        """
        UPDATE players
        SET
            referrals=referrals+1,
            dollars=dollars+100
        WHERE user_id=%s
        """,
        (
            user_id,
        )
    )

    conn.commit()
    conn.close()

    return jsonify({

        "ok": True,

        "player":
            serialize(
                get_player(user_id)
            )
    })


# =========================
# LEADERBOARD
# =========================

@app.get("/api/leaderboard")
def leaderboard():

    conn = db()

    rows = conn.execute(
        """
        SELECT
            username,
            dollars,
            gems
        FROM players
        ORDER BY dollars DESC
        LIMIT 20
        """
    ).fetchall()

    conn.close()

    return jsonify({

        "ok": True,

        "items": [
            dict(row)
            for row in rows
        ]
    })


# =========================
# RUN SERVER
# =========================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=int(
            os.getenv(
                "PORT",
                "5000"
            )
        ),
        debug=False
        )
