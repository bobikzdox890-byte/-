window.onerror = function(message, source, lineno, colno, error) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:15px;font-size:14px">
      JS ERROR:<br>${message}<br>Line: ${lineno}
    </div>`
  );
};


const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


const user = tg?.initDataUnsafe?.user || {
  id: "local-demo",
  first_name: "Player"
};

const uid = String(user.id);
const username = user.username || user.first_name || "Player";


const $ = id => document.getElementById(id);


const toast = msg => {
  $("toast").textContent = msg;
  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 1400);
};


let state = null;


const API = "https://83s8tvz3me.onrender.com";


/* =========================
   API
========================= */

async function api(url, options = {}) {
  try {
    const r = await fetch(API + url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json"
      },
      body: options.body
    });

    if (!r.ok) {
  const text = await r.text();

  console.error(
    "API error:",
    r.status,
    text
  );

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "api_error",
      status: r.status
    };
  }
    }

    return await r.json();

  } catch (err) {
    console.error(
      "API connection error:",
      err
    );

    toast("❌ Нет связи с сервером");

    return {
      ok: false,
      error: "connection"
    };
  }
}


/* =========================
   RENDER
========================= */

function render(p) {
  state = p;

  $("dollars").textContent =
    Number(p.dollars).toFixed(2);

  $("energy").textContent =
    Math.floor(p.energy);

  $("max-energy").textContent =
    Math.floor(p.max_energy);
}


/* =========================
   LOAD
========================= */

async function load() {
  const d = await api(
    `/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`
  );

  console.log("STATE:", d);

  if (d.ok) {
    render(d.player);
  } else {
    toast("❌ API не отвечает");
  }
}


load();

setInterval(load, 1000);


/* =========================
   TAP
========================= */

$("tap-area").addEventListener(
  "click",
  async (e) => {

    console.log("TAP CLICKED");

    if (
      e.target.closest(".bottom") ||
      e.target.closest(".panel")
    ) {
      return;
    }

    const d = await api(
      "/api/tap",
      {
        method: "POST",

        body: JSON.stringify({
          user_id: uid,
          username: username
        })
      }
    );


    if (!d.ok) {

      if (d.error === "cooldown") {
        toast(`⏳ ${d.remaining}s`);
      }

      if (d.error === "energy") {
        toast("⚡ Нет энергии");
      }

      return;
    }


    render(d.player);


    const f = document.createElement("div");

    f.className = "float";

    f.textContent =
      `+${Number(d.reward).toFixed(2)}`;

    f.style.left =
      `${e.clientX - 20}px`;

    f.style.top =
      `${e.clientY - 20}px`;


    $("float-layer").appendChild(f);


    setTimeout(() => {
      f.remove();
    }, 750);


    if (d.gem_drop) {
      toast("💎 +1 G3MS");

    } else if (d.x5) {
      toast("🔥 X5!");

    } else if (d.doubled) {
      toast("⚡ DOUBLE!");
    }
  }
);


/* =========================
   PANELS
========================= */

const panel = $("panel");

console.log("APP JS WORKS");
console.log("PANEL:", panel);
console.log("TAP AREA:", $("tap-area"));
console.log("BOTTOM BUTTONS:", document.querySelectorAll(".bottom button"));


$("close-panel").onclick = () => {
  panel.classList.remove("open");
};


document
  .querySelectorAll(".bottom button")
  .forEach(btn => {

    btn.onclick = () => {
      openPanel(btn.dataset.panel);
    };

  });


function openPanel(type) {

  panel.classList.add("open");


  if (type === "upgrades") {
    upgradesPanel();
  }

  if (type === "gems") {
    gemsPanel();
  }

  if (type === "rating") {
    ratingPanel();
  }

  if (type === "profile") {
    profilePanel();
  }
}


/* =========================
   UPGRADES PANEL
========================= */

async function upgradesPanel() {

  const d = await api(
    `/api/upgrades?user_id=${encodeURIComponent(uid)}`
  );


  if (!d.ok) {

    $("panel-content").innerHTML =
      "<h2>❌ Не удалось загрузить прокачки</h2>";

    return;
  }


  const u = d.upgrades;


  const names = {
    tap_cd: "⏱ Кулдаун тапа",
    income: "🪙 Доход",
    energy: "⚡ Максимум энергии",
    regen: "♻️ Регенерация"
  };


  let html =
    "<h2>⚙️ Прокачка</h2>";


  for (
    const kind of [
      "tap_cd",
      "income",
      "energy",
      "regen"
    ]
  ) {

    const x = u[kind];


    const currency =
      x.currency === "gems"
        ? "💎"
        : "8OLLAR";


    const balance =
      x.currency === "gems"
        ? state.gems
        : state.dollars;


    const enough =
      balance >= x.cost;


    const color =
      enough
        ? "#19d96b"
        : "#e9233f";


    html += `

      <div class="card upgrade-card">

        <h3>${names[kind]}</h3>

        <div class="upgrade-price">

          ${
            x.maxed
              ? "МАКСИМУМ"
              : `${x.cost.toFixed(2)} ${currency}`
          }

        </div>


        <div class="upgrade-level">

          Уровень:
          <b>${x.level}</b>

          ${
            x.max_level !== null
              ? ` / ${x.max_level}`
              : ""
          }

        </div>


        ${
          x.maxed

            ? `
              <button
                class="upgrade-max"
                disabled
              >
                🏆 МАКСИМУМ
              </button>
            `

            : `

              <div class="upgrade-buttons">

                <button
                  style="background:${color}"
                  onclick="buy('${kind}')"
                >
                  +1
                </button>


                <button
                  style="background:${color}"
                  onclick="buyMax('${kind}')"
                >
                  MAX
                </button>

              </div>

            `
        }

      </div>

    `;
  }
$("panel-content").innerHTML = html;
}


/* =========================
   GEMS PANEL
========================= */

function gemsPanel() {

  $("panel-content").innerHTML = `

    <h2>💎 G3MS</h2>

    <div class="blue-menu">

      <button onclick="buy('double')">
        ⚡ Дабл тап
      </button>

      <button onclick="buy('multiplier')">
        📈 Множитель 8OLLAR
      </button>

      <button onclick="buy('gem_income')">
        💎 Доход G3MS
      </button>

    </div>

    <div class="card">
      💎 Баланс:
      ${state.gems.toFixed(0)}
      G3MS
    </div>

    <div class="card">
      ⚡ Дабл:
      ${(state.double_chance * 100).toFixed(0)}%
      / 50%
    </div>

    <div class="card">
      📈 Множитель:
      x${state.income_multiplier.toFixed(2)}
    </div>

    <div class="card">
      💎 Шанс G3MS:
      ${(state.gem_chance * 100).toFixed(0)}%
    </div>

  `;
}


/* =========================
   BUY +1
========================= */

async function buy(kind) {

  const d = await api(
    "/api/upgrade",
    {
      method: "POST",

      body: JSON.stringify({
        user_id: uid,
        kind: kind
      })
    }
  );


  if (!d.ok) {

    if (d.error === "money") {

      toast(
        `❌ Нужно ${d.cost} ${d.currency}`
      );

    } else if (d.error === "max_level") {

      toast(
        "🏆 Максимальный уровень"
      );

    } else {

      toast(
        "❌ Не удалось купить"
      );
    }

    return;
  }


  render(d.player);

  toast("✅ Уровень повышен");


  if (
    kind === "double" ||
    kind === "multiplier" ||
    kind === "gem_income"
  ) {

    gemsPanel();

  } else {

    upgradesPanel();
  }
}


/* =========================
   BUY MAX
========================= */

async function buyMax(kind) {

  console.log("BUY MAX:", kind);

  const d = await api(
    "/api/upgrade_max",
    {
      method: "POST",

      body: JSON.stringify({
        user_id: uid,
        kind: kind
      })
    }
  );

  console.log("BUY MAX RESPONSE:", d);


  if (!d.ok) {

    if (d.error === "money") {

      toast(
        `❌ Нужно ${d.cost} ${d.currency}`
      );

    } else if (d.error === "max_level") {

      toast(
        "🏆 Максимальный уровень"
      );

    } else {

      toast(
        "❌ Не удалось купить MAX"
      );
    }

    return;
  }


  render(d.player);

  toast(
    `🔥 Куплено уровней: ${d.levels_bought}`
  );

  upgradesPanel();
}


/* =========================
   RATING
========================= */

async function ratingPanel() {

  const d = await api(
    "/api/leaderboard"
  );

  let html =
    "<h2>🏆 Рейтинг</h2>";


  (d.items || []).forEach(
    (x, i) => {

      html += `

        <div class="row">

          <div>
            ${i + 1}.
            ${x.username}
          </div>

          <b>
            ${Number(x.dollars).toFixed(0)}
            8OLLAR
          </b>

        </div>

      `;
    }
  );


  $("panel-content").innerHTML = html;
}


/* =========================
   PROFILE
========================= */

async function profilePanel() {

  const d = await api(
    `/api/referrals?user_id=${encodeURIComponent(uid)}`
  );


  $("panel-content").innerHTML = `

    <h2>👤 Профиль</h2>

    <div class="card">

      <b>${username}</b>

      <br>

      ID:
      ${uid}

    </div>

    <div class="card">

      🪙 8OLLAR:
      ${state.dollars.toFixed(2)}

      <br>

      💎 G3MS:
      ${state.gems.toFixed(0)}

    </div>

    <div class="card">

      👥 Рефералы:
      ${d.referrals}

    </div>

    <div class="card">

      🔗 Реферальный код:
      <b>${d.code}</b>

    </div>

  `;
}
