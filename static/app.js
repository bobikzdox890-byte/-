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
      console.error(
        "API error:",
        r.status,
        await r.text()
      );

      return {
        ok: false,
        error: "api_error"
      };
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
