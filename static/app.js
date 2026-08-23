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
const username =
  user.username ||
  user.first_name ||
  "Player";


const $ = id =>
  document.getElementById(id);


/* =========================
   TOAST
========================= */

const toast = msg => {

  $("toast").textContent = msg;

  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 1400);
};


/* =========================
   STATE
========================= */

let state = null;

let cooldownTimer = null;
let energyTimer = null;

let cooldownUntil = 0;

let energyLastUpdate = 0;

let tapBusy = false;


/* =========================
   COOLDOWN UI
========================= */

function createCooldownUI() {

  if ($("cooldown-indicator")) {
    return;
  }

  const indicator =
    document.createElement("div");

  indicator.id =
    "cooldown-indicator";

  indicator.innerHTML = `
    <div id="cooldown-label">
      ГОТОВО
    </div>

    <div id="cooldown-time">
      0.0
    </div>
  `;

  $("tap-area").appendChild(indicator);
}


function updateCooldownUI(remaining) {

  const indicator =
    $("cooldown-indicator");

  const label =
    $("cooldown-label");

  const time =
    $("cooldown-time");

  if (!indicator || !label || !time) {
    return;
  }


  if (remaining <= 0) {

    indicator.classList.remove(
      "cooldown-active"
    );

    indicator.classList.add(
      "cooldown-ready"
    );

    label.textContent =
      "ГОТОВО";

    time.textContent =
      "TAP";

    return;
  }


  indicator.classList.remove(
    "cooldown-ready"
  );

  indicator.classList.add(
    "cooldown-active"
  );

  label.textContent =
    "КУЛДАУН";

  time.textContent =
    remaining.toFixed(1) + "с";
}


function startCooldown(seconds) {

  clearInterval(cooldownTimer);

  const duration =
    Math.max(
      0,
      Number(seconds) || 0
    );

  cooldownUntil =
    performance.now() +
    duration * 1000;

  updateCooldownUI(duration);


  cooldownTimer =
    setInterval(() => {

      const remaining =
        Math.max(
          0,
          (cooldownUntil -
            performance.now()) / 1000
        );

      updateCooldownUI(
        remaining
      );


      if (remaining <= 0) {

        clearInterval(
          cooldownTimer
        );

        cooldownTimer =
          null;

        cooldownUntil = 0;

        tapBusy = false;
      }

    }, 50);
}


/* =========================
   ENERGY UI
========================= */

function startEnergyTimer() {

  clearInterval(
    energyTimer
  );


  energyLastUpdate =
    performance.now();


  energyTimer =
    setInterval(() => {

      if (!state) {
        return;
      }


      const now =
        performance.now();


      const elapsed =
        (now -
          energyLastUpdate) / 1000;


      if (
        elapsed <= 0 ||
        state.energy >=
        state.max_energy
      ) {

        energyLastUpdate =
          now;

        return;
      }


      const regen =
        Number(
          state.regen_cd
        ) || 2;


      const gained =
        elapsed / regen;


      state.energy =
        Math.min(
          Number(
            state.max_energy
          ),
          Number(
            state.energy
          ) + gained
        );


      energyLastUpdate =
        now;


      $("energy").textContent =
        Math.floor(
          state.energy
        );

    }, 100);

}


/* =========================
   API
========================= */

async function api(
  url,
  options = {}
) {

  try {

    const r =
      await fetch(
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
      await r.text();


    let data;


    try {

      data =
        JSON.parse(text);

    } catch {

      console.error(
        "Invalid JSON:",
        text
      );

      return {
        ok: false,
        error: "invalid_response"
      };
    }


    if (!r.ok) {

      console.error(
        "API error:",
        r.status,
        data
      );

      return data;
    }


    return data;


  } catch (err) {

    console.error(
      "API connection error:",
      err
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

function render(p) {

  state = p;


  $("dollars").textContent =
    Number(
      p.dollars
    ).toFixed(2);


  $("energy").textContent =
    Math.floor(
      p.energy
    );


  $("max-energy").textContent =
    Math.floor(
      p.max_energy
    );


  energyLastUpdate =
    performance.now();
}


/* =========================
   INITIAL LOAD
========================= */

async function load() {

  const d =
    await api(
      `/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`
    );


  console.log(
    "STATE:",
    d
  );


  if (!d.ok) {

    toast(
      "❌ API не отвечает"
    );

    return;
  }


  render(
    d.player
  );


  startEnergyTimer();


  /*
     Сервер отдаёт актуальный
     tap_cd, поэтому после
     открытия приложения
     просто показываем READY.
  */

  updateCooldownUI(0);
}


/* =========================
   API URL
========================= */

const API =
  "https://83s8tvz3me.onrender.com";


/* =========================
   TAP BUTTON
========================= */

const tapButton =
  $("tap-button");


let pointerDown = false;


/*
   Палец нажал
*/

tapButton.addEventListener(
  "pointerdown",
  e => {

    e.preventDefault();


    if (
      cooldownUntil > 0 ||
      tapBusy
    ) {
      return;
    }


    pointerDown = true;


    tapButton.classList.add(
      "pressed"
    );


    try {

      tapButton.setPointerCapture(
        e.pointerId
      );

    } catch {}
  }
);


/*
   Палец отпустил
*/

tapButton.addEventListener(
  "pointerup",
  async e => {

    e.preventDefault();


    tapButton.classList.remove(
      "pressed"
    );


    if (!pointerDown) {
      return;
    }


    pointerDown = false;


    if (
      cooldownUntil > 0 ||
      tapBusy
    ) {
      return;
    }


    await doTap(e);
  }
);


/*
   Палец ушёл с экрана
*/

tapButton.addEventListener(
  "pointercancel",
  e => {

    pointerDown = false;

    tapButton.classList.remove(
      "pressed"
    );
  }
);


/*
   Если палец ушёл с кнопки
*/

tapButton.addEventListener(
  "lostpointercapture",
  () => {

    pointerDown = false;

    tapButton.classList.remove(
      "pressed"
    );
  }
);


/* =========================
   TAP REQUEST
========================= */

async function doTap(e) {

  if (
    tapBusy ||
    cooldownUntil > 0
  ) {
    return;
  }


  tapBusy = true;


  const d =
    await api(
      "/api/tap",
      {
        method: "POST",

        body:
          JSON.stringify({
            user_id: uid,
            username: username
          })
      }
    );


  /*
     Сервер сказал:
     ещё кулдаун.
  */

  if (
    !d.ok
  ) {

    tapBusy = false;


    if (
      d.error === "cooldown"
    ) {

      startCooldown(
        d.remaining
      );

      return;
    }


    if (
      d.error === "energy"
    ) {

      toast(
        "⚡ Нет энергии"
      );

      return;
    }


    toast(
      "❌ Ошибка отправки"
    );

    return;
  }


  /*
     Сервер подтвердил тап.
  */

  render(
    d.player
  );


  /*
     Сразу запускаем
     следующий кулдаун.
  */

  startCooldown(
    Number(
      d.player.tap_cd
    )
  );


  /*
     Анимация денег.
  */

  const f =
    document.createElement(
      "div"
    );

  f.className =
    "float";


  f.textContent =
    `+${Number(
      d.reward
    ).toFixed(2)}`;


  const rect =
    tapButton.getBoundingClientRect();


  f.style.left =
    `${
      rect.left +
      rect.width / 2 -
      20
    }px`;


  f.style.top =
    `${
      rect.top +
      rect.height / 2 -
      20
    }px`;


  $("float-layer")
    .appendChild(f);


  setTimeout(() => {
    f.remove();
  }, 750);


  /*
     Бонусы.
  */

  if (
    d.gem_drop
  ) {

    toast(
      "💎 +1 G3MS"
    );

  } else if (
    d.x5
  ) {

    toast(
      "🔥 X5!"
    );

  } else if (
    d.doubled
  ) {

    toast(
      "⚡ DOUBLE!"
    );
  }


  tapBusy = false;
}


/* =========================
   PANELS
========================= */

const panel =
  $("panel");


$("close-panel").onclick =
  () => {

    panel.classList.remove(
      "open"
    );
  };


document
  .querySelectorAll(
    ".bottom button"
  )
  .forEach(btn => {

    btn.onclick = () => {

      openPanel(
        btn.dataset.panel
      );
    };

  });


function openPanel(type) {

  panel.classList.add(
    "open"
  );


  if (
    type === "upgrades"
  ) {

    upgradesPanel();
  }


  if (
    type === "gems"
  ) {

    gemsPanel();
  }


  if (
    type === "rating"
  ) {

    ratingPanel();
  }


  if (
    type === "profile"
  ) {

    profilePanel();
  }
}


/* =========================
   UPGRADES
========================= */

async function upgradesPanel() {

  const d =
    await api(
      `/api/upgrades?user_id=${encodeURIComponent(uid)}`
    );


  if (!d.ok) {

    $("panel-content").innerHTML =
      "<h2>❌ Не удалось загрузить прокачки</h2>";

    return;
  }


  const u =
    d.upgrades;


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

    const x =
      u[kind];


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
   BUY +1
========================= */

async function buy(kind) {

  const d =
    await api(
      "/api/upgrade",
      {
        method: "POST",

        body:
          JSON.stringify({
            user_id: uid,
            kind: kind
          })
      }
    );


  if (!d.ok) {

    if (
      d.error === "money"
    ) {

      toast(
        `❌ Нужно ${d.cost} ${d.currency}`
      );

    } else if (
      d.error === "max_level"
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
    d.player
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

  const d =
    await api(
      "/api/upgrade_max",
      {
        method: "POST",

        body:
          JSON.stringify({
            user_id: uid,
            kind: kind
          })
      }
    );


  if (!d.ok) {

    if (
      d.error === "money"
    ) {

      toast(
        `❌ Нужно ${d.cost} ${d.currency}`
      );

    } else if (
      d.error === "max_level"
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
    d.player
  );


  toast(
    `🔥 Куплено уровней: ${d.levels_bought}`
  );


  upgradesPanel();
}


/* =========================
   RATING
========================= */

async function ratingPanel() {

  const d =
    await api(
      "/api/leaderboard"
    );


  let html =
    "<h2>🏆 Рейтинг</h2>";


  (d.items || [])
    .forEach(
      (x, i) => {

        html += `

          <div class="row">

            <div>
              ${i + 1}.
              ${x.username}
            </div>

            <b>
              ${Number(
                x.dollars
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

  const d =
    await api(
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


/* =========================
   START
========================= */

createCooldownUI();

load();
