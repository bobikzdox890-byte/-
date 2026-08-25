let regenInterval = null;
document.addEventListener("DOMContentLoaded", async () => {
  const data = await api(`/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`);
  if (data && data.ok) { render(data.player); setReady(); startLocalRegenTimer(); } else { toast("❌ API не отвечает"); }
  const tapButton = $("tap-button");
  if (tapButton) {
    const start = async (e) => {
      if (e.cancelable) e.preventDefault();
      tapButton.className = "pressed"; if (tapBusy) return; tapBusy = true;
      const x = e.touches ? e.touches.clientX : e.clientX; const y = e.touches ? e.touches.clientY : e.clientY;
      try {
        const res = await api("/api/tap", { method: "POST", body: JSON.stringify({ user_id: uid, username: username }) });
        if (!res.ok && res.error === "cooldown") { startCooldown(res.remaining); return; }
        if (!res.ok) { toast(res.error === "energy" ? "⚡ Нет энергии" : "❌ Ошибка"); return; }
        render(res.player); startCooldown(res.tap_cd); resetLocalRegenTimer();
        const num = document.createElement("div"); num.className = "reward-float"; num.textContent = `+${Number(res.reward).toFixed(2)}`;
        num.style.left = `${x}px`; num.style.top = `${y}px`; ($("float-layer") || document.body).appendChild(num); setTimeout(() => num.remove(), 850);
        let bonusText = res.gem_drop ? "💎 +1 G3MS" : res.x5 ? "🔥 X5!" : res.doubled ? "⚡ DOUBLE!" : null;
        document.querySelectorAll(".bonus-float").forEach(el => el.remove());
        if (bonusText) {
          const bonus = document.createElement("div"); bonus.className = "bonus-float"; bonus.textContent = bonusText;
          bonus.style.left = `${20 + Math.random() * (Math.max(20, window.innerWidth - 150) - 20)}px`;
          bonus.style.top = `${100 + Math.random() * (Math.max(100, window.innerHeight - 210) - 100)}px`;
          ($("bonus-layer") || document.body).appendChild(bonus); setTimeout(() => bonus.remove(), 850);
        }
      } finally { tapBusy = false; }
    };
    const end = (e) => { if (e.cancelable) e.preventDefault(); tapButton.className = "ready"; };
    tapButton.addEventListener("touchstart", start, { passive: false }); tapButton.addEventListener("touchend", end, { passive: false });
    tapButton.addEventListener("touchcancel", end, { passive: false }); tapButton.addEventListener("mousedown", start); tapButton.addEventListener("mouseup", end);
  }
  const p = findPanelElement(); if ($("close-panel") && p) $("close-panel").onclick = () => { p.classList.remove("open"); currentPanelType = null; };
  document.querySelectorAll(".bottom button").forEach(b => b.onclick = () => { openPanel(b.dataset.panel); });
});
function startLocalRegenTimer() {
  if (regenInterval) clearInterval(regenInterval);
  regenInterval = setInterval(() => {
    if (!window.state || window.state.energy >= window.state.max_energy) return;
    const energyPerTick = 1 + (window.state.regen_level || 0);
    window.state.energy = Math.min(window.state.max_energy, window.state.energy + energyPerTick);
    if (typeof render === "function") { render(window.state); }
  }, 1000);
}
function resetLocalRegenTimer() { startLocalRegenTimer(); }
async function openPanel(t) {
  const p = findPanelElement(); if (!p) return; p.classList.add("open"); currentPanelType = t;
  if (t === "upgrades") upgradesPanel(); if (t === "gems") gemsPanel();
  if (t === "rating") {
    $("panel-content").innerHTML = "<h2>🏆 Рейтинг Игроков</h2><div class='leaderboard-container'><p style='text-align:center;color:#888;'>Загрузка топа...</p></div>";
    const res = await api("/api/leaderboard");
    if (!res || !res.ok) { $("panel-content").innerHTML = "<h2>🏆 Рейтинг Игроков</h2><p style='text-align:center;color:red;'>❌ Ошибка загрузки топа</p>"; return; }
    let html = "<h2>🏆 Рейтинг Игроков</h2><div class='leaderboard-container'>"; let myRank = "N/A";
    res.leaderboard.forEach(player => {
      let rankClass = "rank-normal"; let prefix = `${player.rank}. `;
      if (player.rank === 1) { rankClass = "rank-gold"; prefix = "🥇 1. "; }
      else if (player.rank === 2) { rankClass = "rank-silver"; prefix = "🥈 2. "; }
      else if (player.rank === 3) { rankClass = "rank-bronze"; prefix = "🥉 3. "; }
      let isMe = String(player.user_id) === String(uid); if (isMe) { rankClass += " current-user-row"; myRank = player.rank; }
      html += `<div class="row ${rankClass}"><span>${prefix}${player.username}</span><b>${player.dollars.toFixed(2)} $</b></div>`;
    });
    html += `<div class="row current-user-row" style="margin-top:15px;"><span>Ваше место (${myRank}):</span><b>${Number(state.dollars).toFixed(2)} $</b></div></div>`;
    $("panel-content").innerHTML = html;
  }
  if (t === "profile") {
    $("panel-content").innerHTML = `<h2>👤 Профиль Пользователя</h2><div class="profile-container"><div class="profile-item"><span>Никнейм:</span><span class="profile-value-blue">${username}</span></div><div class="profile-item"><span>Telegram ID:</span><span class="profile-value">${uid}</span></div><div class="profile-item"><span>Баланс:</span><span class="profile-value-green">${Number(state.dollars).toFixed(2)} $</span></div><div class="profile-item"><span>Кристаллы:</span><span class="profile-value-purple">${Number(state.gems).toFixed(0)} 💎</span></div><div class="profile-item"><span>Рефералы:</span><span class="profile-value-gold">${state.referrals || 0} чел.</span></div></div>`;
  }
}
async function upgradesPanel() {
  const d = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`); const content = $("panel-content");
  if (!d || !d.ok) { content.innerHTML = "❌ Ошибка загрузки апгрейдов"; return; }
  let html = "<h2>⚙️ Обычные Апгрейды</h2><div class='blue-menu'>"; const names = { tap_cd: "⏱ Кулдаун тапа", income: "💰 Доход за тап", energy: "🔋 Макс. Энергия", regen: "⚡ Регенерация" };
  for (let k of ["tap_cd", "income", "energy", "regen"]) {
    let up = d.upgrades[k];
    html += `<div class="card upgrade-card"><h3>${names[k]}</h3><div class="upgrade-price">${up.maxed ? "MAX" : up.cost.toFixed(2) + " $"}</div><div class="upgrade-level">Уровень: <b>${up.level}</b> ${up.max_level ? "/ " + up.max_level : ""}</div><div style="display:flex; gap:8px; margin-top:10px;"><button style="flex:1; background:var(--blue); border:none; padding:10px; border-radius:8px; color:#fff; font-weight:bold; cursor:pointer;" onclick="buy('${k}')" ${up.maxed ? "disabled" : ""}>Купить</button><button style="background:#222; border:1px solid #444; padding:10px; border-radius:8px; color:#fff; font-weight:bold; cursor:pointer;" onclick="buyMax('${k}')" ${up.maxed ? "disabled" : ""}>MAX</button></div></div>`;
  }
  html += "</div>"; content.innerHTML = html;
}
async function gemsPanel() {
  const d = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`); const content = $("panel-content");
  if (!d || !d.ok) { content.innerHTML = "❌ Ошибка загрузки магазина"; return; }
  const upDouble = d.upgrades.double; const upMult = d.upgrades.multiplier; const upGemInc = d.upgrades.gem_income;
  content.innerHTML = `<h2>💎 G3MS Премиум Магазин</h2><div class="shop-balance-badge">Ваш баланс: <b>${Number(state.gems).toFixed(0)} 💎</b></div><div class="blue-menu"><div class="card upgrade-card"><h3>⚡ DOUBLE TAP (Шанс x2)</h3><div class="upgrade-price">${upDouble.cost.toFixed(2)} 💎</div><div class="upgrade-level">Уровень: <b>${upDouble.level}</b> (Шанс: ${(state.double_chance * 100).toFixed(0)}%)</div><button style="background:var(--purple); width:100%; border:none; padding:12px; border-radius:12px; color:#fff; font-weight:bold; cursor:pointer;" onclick="buyGemUpgrade('double')">Прокачать</button></div><div class="card upgrade-card"><h3>🔥 MULTIPLIER (Множитель общего дохода)</h3><div class="upgrade-price">${upMult.cost.toFixed(2)} 💎</div><div class="upgrade-level">Уровень: <b>${upMult.level}</b> (Текущий множитель: x${state.income_multiplier})</div><button style="background:var(--purple); width:100%; border:none; padding:12px; border-radius:12px; color:#fff; font-weight:bold; cursor:pointer;" onclick="buyGemUpgrade('multiplier')">Прокачать</button></div><div class="card upgrade-card"><h3>💎 GEM INCOME (Шанс дропа кристаллов)</h3><div class="upgrade-price">${upGemInc.cost.toFixed(2)} 💎</div><div class="upgrade-level">Уровень: <b>${upGemInc.level}</b> (Шанс выпадения: ${(state.gem_chance * 100).toFixed(0)}%)</div><button style="background:var(--purple); width:100%; border:none; padding:12px; border-radius:12px; color:#fff; font-weight:bold; cursor:pointer;" onclick="buyGemUpgrade('gem_income')">Прокачать</button></div></div>`;
}
async function sendUpgradeRequest(k, m = false) {
  const d = await api("/api/upgrades/buy", { method: "POST", body: JSON.stringify({ user_id: uid, kind: k, max: m }) });
  if (!d.ok) { toast("❌ Ошибка покупки апгрейда"); return; }
  render(d.player); toast("✅ Успешно прокачано!"); resetLocalRegenTimer();
  if (currentPanelType === "upgrades") upgradesPanel(); if (currentPanelType === "gems") gemsPanel();
}
window.buy = k => sendUpgradeRequest(k, false); window.buyMax = k => sendUpgradeRequest(k, true); window.buyGemUpgrade = k => sendUpgradeRequest(k, false);
