window.onerror = function(message, source, lineno) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="
      position:fixed;
      top:0;
      left:0;
      right:0;
      z-index:99999;
      background:red;
      color:white;
      padding:15px;
      font-size:14px;
    ">
      JS ERROR:<br>
      ${message}<br>
      Line: ${lineno}
    </div>`
  );
};


/* =========================
   TELEGRAM
========================= */

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

const username =
  user.username ||
  user.first_name ||
  "Player";


const $ = id =>
  document.getElementById(id);


/* =========================
   TOAST
========================= */

let toastTimer = null;

function toast(message) {

  const element = $("toast");

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 1400);
}


/* =========================
   STATE
========================= */

let state = null;

let cooldownTimer = null;
let cooldownEnd = 0;

let tapBusy = false;
let fingerDown = false;


/* =========================
   API
========================= */

const API =
  "https://83s8tvz3me.onrender.com";


async function api(url, options = {}) {

  try {

    const response = await fetch(
      API + url,
      {
        method:
          options.method || "GET",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          options.body
      }
    );


    const text =
      await response.text();


    let data;

    try {

      data = JSON.parse(text);

    } catch {

      console.error(
        "Invalid JSON:",
        text
      );

      return {
        ok: false,
        error: "api_error"
      };
    }


    console.log(
      "API:",
      url,
      data
    );


    if (!response.ok) {

      console.error(
        "API error:",
        response.status,
        data
      );

      return data;
    }


    return data;

  } catch (error) {

    console.error(
      "Connection error:",
      error
    );

    toast(
      "❌ Нет связи с сервером"
    );

    return {
      ok: false,
      error: "connection"
    };
  }
}


/* =========================
   RENDER
========================= */

function render(player) {

  state = player;


  $("dollars").textContent =
    Number(player.dollars).toFixed(2);


  $("energy").textContent =
    Math.floor(player.energy);


  $("max-energy").textContent =
    Math.floor(player.max_energy);
}


/* =========================
   COOLDOWN
========================= */

function startCooldown(seconds) {

  clearInterval(cooldownTimer);

  const button =
    $("tap-button");


  const value =
    Number(seconds);


  console.log(
    "START COOLDOWN:",
    value
  );


  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {

    stopCooldown();
    return;
  }


  cooldownEnd =
    Date.now() +
    value * 1000;


  button.classList.add(
    "cooldown"
  );


  function updateCooldown() {

    const remaining =
      Math.max(
        0,
        cooldownEnd - Date.now()
      ) / 1000;


    if (remaining <= 0) {

      stopCooldown();

      return;
    }


    button.textContent =
      `⏳ ${remaining.toFixed(1)}`;
  }


  updateCooldown();


  cooldownTimer =
    setInterval(
      updateCooldown,
      50
    );
}


function stopCooldown() {

  clearInterval(
    cooldownTimer
  );

  cooldownTimer = null;

  cooldownEnd = 0;


  const button =
    $("tap-button");


  button.classList.remove(
    "cooldown"
  );


  button.textContent =
    "TAP";
}


/* =========================
   INITIAL LOAD
========================= */

async function load() {

  const data =
    await api(
      `/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`
    );


  console.log(
    "INITIAL STATE:",
    data
  );


  if (!data.ok) {

    toast(
      "❌ API не отвечает"
    );

    return;
  }


  render(
    data.player
  );
}


load();


/* =========================
   TAP BUTTON
========================= */

const tapButton =
  $("tap-button");


tapButton.addEventListener(
  "pointerdown",
  async (event) => {

    event.preventDefault();


    if (fingerDown) {
      return;
    }


    fingerDown = true;


    tapButton.classList.add(
      "pressed"
    );


    if (tapBusy) {
      return;
    }


    tapBusy = true;


    try {

      const data =
        await api(
          "/api/tap",
          {
            method: "POST",

            body: JSON.stringify({
              user_id: uid,
              username: username
            })
          }
        );


      console.log(
        "TAP RESPONSE:",
        data
      );


      /* =====================
         COOLDOWN
      ===================== */

      if (
        !data.ok &&
        data.error === "cooldown"
      ) {

        const remaining =
          Number(data.remaining);


        console.log(
          "SERVER COOLDOWN:",
          remaining
        );


        startCooldown(
          remaining
        );


        toast(
          `⏳ ${remaining.toFixed(1)}с`
        );


        return;
      }


      /* =====================
         ENERGY
      ===================== */

      if (
        !data.ok &&
        data.error === "energy"
      ) {

        toast(
          "⚡ Нет энергии"
        );

        return;
      }


      /* =====================
         OTHER ERROR
      ===================== */

      if (!data.ok) {

        toast(
          "❌ Ошибка тапа"
        );

        return;
      }


      /* =====================
         SUCCESS
      ===================== */

      render(
        data.player
      );


      /*
         ВАЖНО:
         кулдаун берём только
         из ответа сервера.
      */

      const cooldown =
        Number(data.tap_cd);


      console.log(
        "SUCCESS COOLDOWN:",
        cooldown
      );


      startCooldown(
        cooldown
      );


      /* =====================
         FLOAT REWARD
      ===================== */

      const float =
        document.createElement(
          "div"
        );


      float.className =
        "float";


      float.textContent =
        `+${Number(
          data.reward
        ).toFixed(2)}`;


      float.style.left =
        `${event.clientX - 20}px`;


      float.style.top =
        `${event.clientY - 20}px`;


      $("float-layer")
        .appendChild(float);


      setTimeout(() => {
        float.remove();
      }, 750);


      /* =====================
         BONUSES
      ===================== */

      if (data.gem_drop) {

        toast(
          "💎 +1 G3MS"
        );

      } else if (data.x5) {

        toast(
          "🔥 X5!"
        );

      } else if (data.doubled) {

        toast(
          "⚡ DOUBLE!"
        );
      }


    } finally {

      tapBusy = false;
    }
  }
);


/* =========================
   RELEASE FINGER
========================= */

function releaseTap(event) {

  if (event) {
    event.preventDefault();
  }


  fingerDown = false;


  tapButton.classList.remove(
    "pressed"
  );
}


tapButton.addEventListener(
  "pointerup",
  releaseTap
);


tapButton.addEventListener(
  "pointercancel",
  releaseTap
);


tapButton.addEventListener(
  "pointerleave",
  releaseTap
);


/* =========================
   PANELS
========================= */

const panel =
  $("panel");


$("close-panel").onclick = () => {

  panel.classList.remove(
    "open"
  );
};


document
  .querySelectorAll(
    ".bottom button"
  )
  .forEach(button => {

    button.onclick = () => {

      openPanel(
        button.dataset.panel
      );

    };

  });


function openPanel(type) {

  panel.classList.add(
    "open"
  );


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
   UPGRADES
========================= */

async function upgradesPanel() {

  const data =
    await api(
      `/api/upgrades?user_id=${encodeURIComponent(uid)}`
    );


  if (!data.ok) {

    $("panel-content").innerHTML =
      "<h2>❌ Не удалось загрузить прокачки</h2>";

    return;
  }


  const upgrades =
    data.upgrades;


  const names = {

    tap_cd:
      "⏱ Кулдаун тапа",

    income:
      "🪙 Доход",

    energy:
      "⚡ Максимум энергии",

    regen:
      "♻️ Регенерация"
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

    const upgrade =
      upgrades[kind];


    const currency =
      upgrade.currency === "gems"
        ? "💎"
        : "8OLLAR";


    const balance =
      upgrade.currency === "gems"
        ? state.gems
        : state.dollars;


    const enough =
      balance >= upgrade.cost;


    const color =
      enough
        ? "#19d96b"
        : "#e9233f";


    html += `

      <div class="card upgrade-card">

        <h3>
          ${names[kind]}
        </h3>

        <div class="upgrade-price">

          ${
            upgrade.maxed
              ? "МАКСИМУМ"
              : `${upgrade.cost.toFixed(2)} ${currency}`
          }

        </div>

        <div class="upgrade-level">

          Уровень:
          <b>${upgrade.level}</b>

          ${
            upgrade.max_level !== null
              ? ` / ${upgrade.max_level}`
              : ""
          }

        </div>

        ${
          upgrade.maxed

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


  $("panel-content")
    .innerHTML = html;
}


/* =========================
   GEMS
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
   BUY
========================= */

async function buy(kind) {

  const data =
    await api(
      "/api/upgrade",
      {
        method: "POST",

        body: JSON.stringify({
          user_id: uid,
          kind: kind
        })
      }
    );


  if (!data.ok) {

    if (data.error === "money") {

      toast(
        `❌ Нужно ${data.cost} ${data.currency}`
      );

    } else if (
      data.error === "max_level"
    ) {

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


  render(
    data.player
  );


  toast(
    "✅ Уровень повышен"
  );


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

  const data =
    await api(
      "/api/upgrade_max",
      {
        method: "POST",

        body: JSON.stringify({
          user_id: uid,
          kind: kind
        })
      }
    );


  if (!data.ok) {

    if (data.error === "money") {

      toast(
        `❌ Нужно ${data.cost} ${data.currency}`
      );

    } else if (
      data.error === "max_level"
    ) {

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


  render(
    data.player
  );


  toast(
    `🔥 Куплено уровней: ${data.levels_bought}`
  );


  upgradesPanel();
}


/* =========================
   RATING
========================= */

async function ratingPanel() {

  const data =
    await api(
      "/api/leaderboard"
    );


  let html =
    "<h2>🏆 Рейтинг</h2>";


  (data.items || [])
    .forEach(
      (item, index) => {

        html += `

          <div class="row">

            <div>
              ${index + 1}.
              ${item.username}
            </div>

            <b>
              ${Number(
                item.dollars
              ).toFixed(0)}
              8OLLAR
            </b>

          </div>
        `;
      }
    );


  $("panel-content")
    .innerHTML = html;
}


/* =========================
   PROFILE
========================= */

async function profilePanel() {

  const data =
    await api(
      `/api/referrals?user_id=${encodeURIComponent(uid)}`
    );


  $("panel-content")
    .innerHTML = `

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
        ${data.referrals}

      </div>

      <div class="card">

        🔗 Реферальный код:
        <b>${data.code}</b>

      </div>

    `;
  }
