document.addEventListener("DOMContentLoaded", async () => {
  const data = await api(`/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`);
  if (data && data.ok) { render(data.player); setReady(); } else { toast("❌ API не отвечает"); }

  const tapButton = $("tap-button");
  if (tapButton) {
    const start = async (e) => {
      if (e.cancelable) e.preventDefault();
      tapButton.className = "pressed";
      if (tapBusy) return;
      tapBusy = true;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      try {
        const res = await api("/api/tap", { method: "POST", body: JSON.stringify({ user_id: uid, username: username }) });
        if (!res.ok && res.error === "cooldown") { startCooldown(res.remaining); return; }
        if (!res.ok) { toast(res.error === "energy" ? "⚡ Нет энергии" : "❌ Ошибка"); return; }
        render(res.player); startCooldown(res.tap_cd);
        const num = document.createElement("div"); num.className = "reward-float"; num.textContent = `+${Number(res.reward).toFixed(2)}`;
        num.style.left = `${x}px`; num.style.top = `${y}px`;
        ($("float-layer") || document.body).appendChild(num);
        setTimeout(() => num.remove(), 850);
      } finally { tapBusy = false; }
    };
    const end = (e) => { if (e.cancelable) e.preventDefault(); tapButton.className = "ready"; };
    tapButton.addEventListener("touchstart", start, { passive: false });
    tapButton.addEventListener("touchend", end, { passive: false });
    tapButton.addEventListener("mousedown", start);
    tapButton.addEventListener("mouseup", end);
  }

  const p = findPanelElement();
  if ($("close-panel") && p) $("close-panel").onclick = () => { p.classList.remove("open"); currentPanelType = null; };
  document.querySelectorAll(".bottom button").forEach(b => b.onclick = () => { openPanel(b.dataset.panel); });
});

function openPanel(t) {
  const p = findPanelElement(); if (!p) return; p.classList.add("open"); currentPanelType = t;
  if (t === "upgrades") upgradesPanel(); if (t === "gems") gemsPanel();
  if (t === "rating") $("panel-content").innerHTML = `<h2>🏆 Топ</h2><div class="row"><div>1. Игрок</div><b>999.00 $</b></div>`;
  if (t === "profile") $("panel-content").innerHTML = `<h2>👤 Профиль</h2><p>ID: <b>${uid}</b></p><p>Баланс: <b>${Number(state.dollars).toFixed(2)} $</b></p>`;
}

async function upgradesPanel() {
  const d = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`);
  if (!d.ok) return;
  let html = "<h2>⚙️ Прокачка</h2>";
  for (const k of ["tap_cd", "income", "energy", "regen"]) {
    const up = d.upgrades[k];
    html += `<div class="card"><h3>${k}</h3><b>${up.cost.toFixed(2)} $</b><br>Lvl: ${up.level}<br><button onclick="buy('${k}')">+1</button></div>`;
  }
  $("panel-content").innerHTML = html;
}

async function gemsPanel() {
  const d = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`);
  if (!d.ok) return;
  let html = "<h2>💎 Магазин</h2>";
  for (const k of ["double", "multiplier", "gem_income"]) {
    const up = d.upgrades[k];
    html += `<div class="card"><h3>${k}</h3><b>${up.cost.toFixed(2)} 💎</b><br>Lvl: ${up.level}<br><button onclick="buyGemUpgrade('${k}')">Купить</button></div>`;
  }
  $("panel-content").innerHTML = html;
}

async function sendUpgradeRequest(k, m = false) {
  const d = await api("/api/upgrades/buy", { method: "POST", body: JSON.stringify({ user_id: uid, kind: k, max: m }) });
  if (!d.ok) { toast("❌ Ошибка"); return; }
  render(d.player); toast("✅ Качнул!");
  if (currentPanelType === "upgrades") upgradesPanel(); if (currentPanelType === "gems") gemsPanel();
}
window.buy = k => sendUpgradeRequest(k, false);
window.buyMax = k => sendUpgradeRequest(k, true);
window.buyGemUpgrade = k => sendUpgradeRequest(k, false);
