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


const user =
  tg?.initDataUnsafe?.user || {
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
  if (!element) return;
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
    const response =
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

    return data;

  } catch (error) {
    console.error(
      "Connection error:",
      error
    );
    toast(
      "вќЊ РќРµС‚ СЃРІСЏР·Рё СЃ СЃРµСЂРІРµСЂРѕРј"
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

  const cd =
    Number(player.tap_cd);

  if (
    Number.isFinite(cd) &&
    cd > 0
  ) {
    if (
      cooldownEnd <= Date.now()
    ) {
      setReady();
    }
  }
}


/* =========================
   COOLDOWN UI
========================= */

function updateCooldownIndicator(
  remaining
) {
  const indicator =
    $("cooldown-indicator");

  const time =
    $("cooldown-time");

  if (!indicator || !time) return;

  if (remaining <= 0) {
    indicator.classList.remove(
      "cooldown-active"
    );
    indicator.classList.add(
      "cooldown-ready"
    );
    time.textContent =
      "READY";
    return;
  }

  indicator.classList.remove(
    "cooldown-ready"
  );
  indicator.classList.add(
    "cooldown-active"
  );

  time.textContent =
    `${remaining.toFixed(2)}s`;
}


function setReady() {
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  cooldownEnd = 0;

  const button = $("tap-button");

  button.classList.remove("cooldown");
  button.classList.add("ready");

  updateCooldownIndicator(0);
}


function startCooldown(seconds) {
  clearInterval(cooldownTimer);

  const value = Number(seconds);

  if (!Number.isFinite(value) || value <= 0) {
    setReady();
    return;
  }

  cooldownEnd = Date.now() + value * 1000;

  const button = $("tap-button");

  button.classList.remove("ready");
  button.classList.add("cooldown");

  function updateCooldown() {
    const remaining = Math.max(0, cooldownEnd - Date.now()) / 1000;
    updateCooldownIndicator(remaining);

    if (remaining <= 0) {
      setReady();
      return;
    }
  }

  updateCooldown();
  cooldownTimer = setInterval(updateCooldown, 20);
}


/* =========================
   INITIAL LOAD
========================= */

async function load() {
  const data =
    await api(
      `/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`
    );

  if (!data.ok) {
    toast(
      "вќЊ API РЅРµ РѕС‚РІРµС‡Р°РµС‚"
    );
    return;
  }

  render(data.player);
  setReady();
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

    tapButton.classList.add("pressed");

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

      if (
        !data.ok &&
        data.error === "cooldown"
      ) {
        const remaining =
          Number(data.remaining);

        if (
          Number.isFinite(remaining) &&
          remaining > 0
        ) {
          startCooldown(remaining);
          toast(`вЏі ${remaining.toFixed(2)}СЃ`);
        } else {
          setReady();
        }

        return;
      }

      if (
        !data.ok &&
        data.error === "energy"
      ) {
        toast("вљЎ РќРµС‚ СЌРЅРµСЂРіРёРё");
        return;
      }

      if (!data.ok) {
        toast("вќЊ РћС€РёР±РєР° С‚Р°РїР°");
        return;
      }

      render(data.player);

      const cooldown =
        Number(data.tap_cd);

      startCooldown(cooldown);

      const reward =
        document.createElement("div");

      reward.className =
        "reward-float";

      reward.textContent =
        `+${Number(data.reward).toFixed(2)}`;

      const randomX =
        event.clientX
        + (Math.random() * 100 - 50);

      const randomY =
        event.clientY
        + (Math.random() * 80 - 40);

      reward.style.left =
        `${randomX}px`;

      reward.style.top =
        `${randomY}px`;

      $("float-layer")
        .appendChild(reward);

      setTimeout(() => {
        reward.remove();
      }, 850);

      let bonusText = null;

      if (data.gem_drop) {
        bonusText = "рџ’Ћ +1 G3MS";
      } else if (data.x5) {
        bonusText = "рџ”Ґ X5!";
      } else if (data.doubled) {
        bonusText = "вљЎ DOUBLE!";
      }

      document
        .querySelectorAll(".bonus-float")
        .forEach(element => element.remove());

      if (bonusText) {
        const bonus =
          document.createElement("div");

        bonus.className =
          "bonus-float";

        bonus.textContent =
          bonusText;

        const marginX = 20;
        const marginTop = 100;
        const marginBottom = 150;

        const maxX =
          Math.max(
            marginX,
            window.innerWidth - 150
          );

        const maxY =
          Math.max(
            marginTop,
            window.innerHeight - marginBottom - 60
          );

        const randomBonusX =
          marginX +
          Math.random() * (maxX - marginX);

        const randomBonusY =
          marginTop +
          Math.random() * (maxY - marginTop);

        bonus.style.left =
          `${randomBonusX}px`;

        bonus.style.top =
          `${randomBonusY}px`;

        $("bonus-layer")
          .appendChild(bonus);

        setTimeout(() => {
          bonus.remove();
        }, 850);
      }

    } finally {
      tapBusy = false;
    }
  },
  {
    passive: false
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

  tapButton.classList.remove("pressed");
}


tapButton.addEventListener(
  "pointerup",
  releaseTap,
  {
    passive: false
  }
);


tapButton.addEventListener(
  "pointercancel",
  releaseTap,
  {
    passive: false
  }
);


tapButton.addEventListener(
  "pointerleave",
  releaseTap,
  {
    passive: false
  }
);


/* =========================
   PANELS
========================= */

const panel =
  $("panel");


$("close-panel").onclick = () => {
  panel.classList.remove("open");
};


document
  .querySelectorAll(".bottom button")
  .forEach(button => {
    button.onclick = () => {
      openPanel(button.dataset.panel);
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
   UPGRADES
========================= */

async function upgradesPanel() {
  const data =
    await api(
      `/api/upgrades?user_id=${encodeURIComponent(uid)}`
    );

  if (!data.ok) {
    $("panel-content").innerHTML =
      "<h2>вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РїСЂРѕРєР°С‡РєРё</h2>";
    return;
  }

  const upgrades = data.upgrades;

  const names = {
    tap_cd: "вЏ± РљСѓР»РґР°СѓРЅ С‚Р°РїР°",
    income: "рџЄ™ Р”РѕС…РѕРґ",
    energy: "вљЎ РњР°РєСЃРёРјСѓРј СЌРЅРµСЂРіРёРё",
    regen: "в™»пёЏ Р РµРіРµРЅРµСЂР°С†РёСЏ"
  };

  let html = "<h2>вљ™пёЏ РџСЂРѕРєР°С‡РєР°</h2>";

  for (
    const kind of [
      "tap_cd",
      "income",
      "energy",
      "regen"
    ]
  ) {
    const upgrade = upgrades[kind];

    const currency =
      upgrade.currency === "gems"
        ? "рџ’Ћ"
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
        <h3>${names[kind]}</h3>
        <div class="upgrade-price">
          ${
            upgrade.maxed
              ? "РњРђРљРЎРРњРЈРњ"
              : `${upgrade.cost.toFixed(2)} ${currency}`
          }
        </div>
        <div class="upgrade-level">
          РЈСЂРѕРІРµРЅСЊ:
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
                рџЏ† РњРђРљРЎРРњРЈРњ
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
   GEMS
========================= */

function gemsPanel() {
  const doubleCost =
    25 * (3 ** state.double_level);

  const multiplierCost =
    50 * (2 ** state.multiplier_level);

  const gemIncomeCost =
    100 * (1.8 ** state.gem_income_level);

  $("panel-content").innerHTML = `
    <h2>рџ’Ћ G3MS</h2>
    <div class="blue-menu">
      <button onclick="buy('double')">
        вљЎ Р”Р°Р±Р» С‚Р°Рї
        <small>
          рџ’Ћ ${doubleCost.toFixed(0)}
        </small>
      </button>
      <button onclick="buy('multiplier')">
        рџ“€ РњРЅРѕР¶РёС‚РµР»СЊ 8OLLAR
        <small>
          рџ’Ћ ${multiplierCost.toFixed(0)}
        </small>
      </button>
      <button onclick="buy('gem_income')">
        рџ’Ћ Р”РѕС…РѕРґ G3MS
        <small>
          рџ’Ћ ${gemIncomeCost.toFixed(0)}
        </small>
      </button>
    </div>
    <div class="card">
      рџ’Ћ Р‘Р°Р»Р°РЅСЃ:
      ${state.gems.toFixed(0)}
      G3MS
    </div>
    <div class="card">
      вљЎ Р”Р°Р±Р»:
      ${(state.double_chance * 100).toFixed(0)}%
      / 50%
    </div>
    <div class="card">
      рџ“€ РњРЅРѕР¶РёС‚РµР»СЊ:
      x${state.income_multiplier.toFixed(2)}
    </div>
    <div class="card">
      рџ’Ћ РЁР°РЅСЃ G3MS:
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
      toast(`вќЊ РќСѓР¶РЅРѕ ${data.cost} ${data.currency}`);
    } else if (data.error === "max_level") {
      toast("рџЏ† РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№ СѓСЂРѕРІРµРЅСЊ");
    } else {
      toast("вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ РєСѓРїРёС‚СЊ");
    }
    return;
  }

  render(data.player);

  toast("вњ… РЈСЂРѕРІРµРЅСЊ РїРѕРІС‹С€РµРЅ");

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
      toast(`вќЊ РќСѓР¶РЅРѕ ${data.cost} ${data.currency}`);
    } else if (data.error === "max_level") {
      toast("рџЏ† РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№ СѓСЂРѕРІРµРЅСЊ");
    } else {
      toast("вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ РєСѓРїРёС‚СЊ MAX");
    }
    return;
  }

  render(data.player);

  toast(`рџ”Ґ РљСѓРїР»РµРЅРѕ СѓСЂРѕРІРЅРµР№: ${data.levels_bought}`);

  upgradesPanel();
}


/* =========================
   RATING
========================= */

async function ratingPanel() {
  const data =
    await api("/api/leaderboard");

  let html = "<h2>рџЏ† Р РµР№С‚РёРЅРі</h2>";

  (data.items || []).forEach((item, index) => {
    html += `
      <div class="row">
        <div>
          ${index + 1}.
          ${item.username}
        </div>
        <b>
          ${Number(item.dollars).toFixed(0)}
          8OLLAR
        </b>
      </div>
    `;
  });

  $("panel-content").innerHTML = html;
}


/* =========================
   PROFILE
========================= */

async function profilePanel() {
  const data =
    await api(
      `/api/referrals?user_id=${encodeURIComponent(uid)}`
    );

  $("panel-content").innerHTML = `
    <h2>рџ‘¤ РџСЂРѕС„РёР»СЊ</h2>
    <div class="card">
      <b>${username}</b>
      <br>
      ID:
      ${uid}
    </div>
    <div class="card">
      рџЄ™ 8OLLAR:
      ${state.dollars.toFixed(2)}
      <br>
      рџ’Ћ G3MS:
      ${state.gems.toFixed(0)}
    </div>
    <div class="card">
      рџ‘Ґ Р РµС„РµСЂР°Р»С‹:
      ${data.referrals}
    </div>
    <div class="card">
      рџ”— Р РµС„РµСЂР°Р»СЊРЅС‹Р№ РєРѕРґ:
      <b>${data.code}</b>
    </div>
  `;
          }
