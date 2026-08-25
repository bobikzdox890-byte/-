window.onerror = function(message, source, lineno) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:15px;font-size:14px;">JS ERROR:<br>${message}<br>Line: ${lineno}</div>`
  );
};

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const user = tg?.initDataUnsafe?.user || { id: "local-demo", first_name: "Player" };
const uid = String(user.id);
const username = user.username || user.first_name || "Player";

const $ = id => document.getElementById(id);
let toastTimer = null;

function toast(message) {
  const element = $("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.classList.remove("show"); }, 1400);
}

let state = null;
let cooldownTimer = null;
let cooldownEnd = 0;
let tapBusy = false;
let currentPanelType = null;

const API = window.location.origin;

async function api(url, options = {}) {
  try {
    const response = await fetch(API + url, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: options.body
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: "api_error" }; }
    return data;
  } catch (error) {
    toast("❌ Нет связи с сервером");
    return { ok: false, error: "connection" };
  }
}

function render(player) {
  state = player;
  const dollarsEl = $("dollars");
  const energyEl = $("energy");
  const maxEnergyEl = $("max-energy");

  if (dollarsEl) dollarsEl.textContent = Number(player.dollars).toFixed(2);
  if (energyEl) energyEl.textContent = Math.floor(player.energy);
  if (maxEnergyEl) maxEnergyEl.textContent = Math.floor(player.max_energy);

  const cd = Number(player.tap_cd);
  if (Number.isFinite(cd) && cd > 0 && cooldownEnd <= Date.now()) {
    setReady();
  }
}

function updateCooldownIndicator(remaining) {
  const indicator = $("cooldown-indicator");
  const time = $("cooldown-time");
  if (!indicator || !time) return;

  if (remaining <= 0) {
    indicator.classList.remove("cooldown-active");
    indicator.classList.add("cooldown-ready");
    time.textContent = "READY";
    return;
  }
  indicator.classList.remove("cooldown-ready");
  indicator.classList.add("cooldown-active");
  time.textContent = `${remaining.toFixed(2)}s`;
}

function setReady() {
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  cooldownEnd = 0;
  const button = $("tap-button");
  if (button) {
    button.classList.remove("cooldown");
    button.classList.add("ready");
  }
  updateCooldownIndicator(0);
}

function startCooldown(seconds) {
  clearInterval(cooldownTimer);
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) { setReady(); return; }

  cooldownEnd = Date.now() + value * 1000;
  const button = $("tap-button");
  if (button) {
    button.classList.remove("ready");
    button.classList.add("cooldown");
  }

  function updateCooldown() {
    const remaining = Math.max(0, cooldownEnd - Date.now()) / 1000;
    updateCooldownIndicator(remaining);
    if (remaining <= 0) { setReady(); return; }
  }
  updateCooldown();
  cooldownTimer = setInterval(updateCooldown, 20);
}

document.addEventListener("DOMContentLoaded", async () => {
  const data = await api(`/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`);
  if (data && data.ok) {
    render(data.player);
    setReady();
  } else {
    toast("❌ API не отвечает");
  }

  const tapButton = $("tap-button");
  if (tapButton) {
    
    // Мгновенный тач-клик на мобильном без выделения и задержек
    const handleTapStart = async (event) => {
      if (event.cancelable) event.preventDefault();
      
      // Кнопка визуально "утопилась"
      tapButton.classList.add("pressed"); 
      
      if (tapBusy) return;
      tapBusy = true;

      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;

      try {
        const res = await api("/api/tap", {
          method: "POST",
          body: JSON.stringify({ user_id: uid, username: username })
        });

        if (!res.ok && res.error === "cooldown") {
          const remaining = Number(res.remaining);
          if (Number.isFinite(remaining) && remaining > 0) {
            startCooldown(remaining);
            toast(`⏳ ${remaining.toFixed(2)}с`);
          } else { setReady(); }
          return;
        }
        if (!res.ok && res.error === "energy") { toast("⚡ Нет энергии"); return; }
        if (!res.ok) { toast("❌ Ошибка тапа"); return; }

        render(res.player);
        startCooldown(Number(res.tap_cd));

        const reward = document.createElement("div");
        reward.className = "reward-float";
        reward.textContent = `+${Number(res.reward).toFixed(2)}`;
        reward.style.left = `${clientX + (Math.random() * 80 - 40)}px`;
        reward.style.top = `${clientY + (Math.random() * 60 - 30)}px`;
        const floatLayer = $("float-layer");
        if (floatLayer) floatLayer.appendChild(reward);
        setTimeout(() => { reward.remove(); }, 850);

        let bonusText = res.gem_drop ? "💎 +1 G3MS" : res.x5 ? "🔥 X5!" : res.doubled ? "⚡ DOUBLE!" : null;
        document.querySelectorAll(".bonus-float").forEach(el => el.remove());

        if (bonusText) {
          const bonus = document.createElement("div");
          bonus.className = "bonus-float";
          bonus.textContent = bonusText;
          bonus.style.left = `${20 + Math.random() * (Math.max(20, window.innerWidth - 150) - 20)}px`;
          bonus.style.top = `${100 + Math.random() * (Math.max(100, window.innerHeight - 210) - 100)}px`;
          const bonusLayer = $("bonus-layer");
          if (bonusLayer) bonusLayer.appendChild(bonus);
          setTimeout(() => { bonus.remove(); }, 850);
        }
      } finally { tapBusy = false; }
    };

    const handleTapEnd = (event) => {
      if (event.cancelable) event.preventDefault();
      // Отпустил палец — кнопка вернулась обратно
      tapButton.classList.remove("pressed"); 
    };

    // Вешаем мобильные тачи
    tapButton.addEventListener("touchstart", handleTapStart, { passive: false });
    tapButton.addEventListener("touchend", handleTapEnd, { passive: false });
    tapButton.addEventListener("touchcancel", handleTapEnd, { passive: false });
    
    // Подстраховка для мышки ПК
    tapButton.addEventListener("mousedown", handleTapStart);
    tapButton.addEventListener("mouseup", handleTapEnd);
    tapButton.addEventListener("mouseleave", handleTapEnd);
  }

  const panel = $("panel");
  const closePanel = $("close-panel");
  if (closePanel && panel) {
    closePanel.onclick = () => { panel.classList.remove("open"); currentPanelType = null; };
  }

  document.querySelectorAll(".bottom button").forEach(btn => {
    btn.onclick = () => { openPanel(btn.dataset.panel); };
  });
});

function openPanel(type) {
  const panel = $("panel");
  if (!panel) return;
  panel.classList.add("open");
  currentPanelType = type;
  if (type === "upgrades") upgradesPanel();
  if (type === "gems") gemsPanel();
  if (type === "rating") ratingPanel();
  if (type === "profile") profilePanel();
}

async function upgradesPanel() {
  const data = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`);
  const content = $("panel-content");
  if (!content) return;
  if (!data.ok) { content.innerHTML = "<h2>❌ Ошибка загрузки</h2>"; return; }
  
  const names = { tap_cd: "⏱ Кулдаун тапа", income: "🪙 Доход", energy: "⚡ Максимум энергии", regen: "♻️ Регенерация" };
  let html = "<h2>⚙️ Прокачка</h2>";

  for (const kind of ["tap_cd", "income", "energy", "regen"]) {
    const up = data.upgrades[kind];
    const color = state.dollars >= up.cost ? "#19d96b" : "#e9233f";
    html += `
      <div class="card upgrade-card">
        <h3>${names[kind]}</h3>
        <div class="upgrade-price">${up.maxed ? "МАКСИМУМ" : `${up.cost.toFixed(2)} 8OLLAR`}</div>
        <div class="upgrade-level">Уровень: <b>${up.level}</b>${up.max_level ? ` / ${up.max_level}` : ""}</div>
        ${up.maxed ? `<button class="upgrade-max" disabled>🏆 МАКСИМУМ</button>` : 
          `<div class="upgrade-buttons">
            <button style="background:${color}" onclick="buy('${kind}')">+1</button>
            <button style="background:${color}" onclick="buyMax('${kind}')">MAX</button>
          </div>`
        }
      </div>`;
  }
  content.innerHTML = html;
}

async function gemsPanel() {
  const data = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`);
  const content = $("panel-content");
  if (!content) return;
  if (!data.ok) { content.innerHTML = "<h2>❌ Ошибка загрузки</h2>"; return; }

  const upDouble = data.upgrades["double"];
  const upMult = data.upgrades["multiplier"];
  const upGemInc = data.upgrades["gem_income"];

  content.innerHTML = `
    <h2>💎 G3MS Магазин</h2>
    <div class="blue-menu">
      <div class="card upgrade-card">
        <h3>⚡ DOUBLE TAP (Шанс x2)</h3>
        <div class="upgrade-price">${upDouble.cost.toFixed(2)} 💎</div>
        <div class="upgrade-level">Уровень: <b>${upDouble.level}</b> (Шанс: ${(state.double_chance * 100).toFixed(0)}%)</div>
        <button style="background:var(--purple)" onclick="buyGemUpgrade('double')">Прокачать</button>
      </div>
      <div class="card upgrade-card">
        <h3>🔥 MULTIPLIER (Множитель)</h3>
        <div class="upgrade-price">${upMult.cost.toFixed(2)} 💎</div>
        <div class="upgrade-level">Уровень: <b>${upMult.level}</b> (Множитель: x${state.income_multiplier})</div>
        <button style="background:var(--purple)" onclick="buyGemUpgrade('multiplier')">Прокачать</button>
      </div>
      <div class="card upgrade-card">
                               
