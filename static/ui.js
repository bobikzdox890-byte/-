document.addEventListener("DOMContentLoaded", async () => {
  // Загружаем стартовое состояние игрока при входе
  const data = await api(`/api/state?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(username)}`);
  if (data && data.ok) { 
    render(data.player); 
    setReady(); 
  } else { 
    toast("❌ API не отвечает"); 
  }

  // Логика пулеметного тапа кнопки (без задержек)
  const tapButton = $("tap-button");
  if (tapButton) {
    const start = async (e) => {
      if (e.cancelable) e.preventDefault();
      tapButton.className = "pressed"; // Мгновенное сжатие кнопки
      if (tapBusy) return;
      tapBusy = true;

      const x = e.touches ? e.touches.clientX : e.clientX;
      const y = e.touches ? e.touches.clientY : e.clientY;

      try {
        const res = await api("/api/tap", { 
          method: "POST", 
          body: JSON.stringify({ user_id: uid, username: username }) 
        });
        if (!res.ok && res.error === "cooldown") { startCooldown(res.remaining); return; }
        if (!res.ok) { toast(res.error === "energy" ? "⚡ Нет энергии" : "❌ Ошибка"); return; }

        render(res.player); 
        startCooldown(res.tap_cd);

        // Красивые вылетающие цифры дохода
        const num = document.createElement("div"); 
        num.className = "reward-float"; 
        num.textContent = `+${Number(res.reward).toFixed(2)}`;
        num.style.left = `${x}px`; 
        num.style.top = `${y}px`;
        ($("float-layer") || document.body).appendChild(num);
        setTimeout(() => num.remove(), 850);

        // Бонусные вылеты (Double, X5, Гемы)
        let bonusText = res.gem_drop ? "💎 +1 G3MS" : res.x5 ? "🔥 X5!" : res.doubled ? "⚡ DOUBLE!" : null;
        document.querySelectorAll(".bonus-float").forEach(el => el.remove());
        if (bonusText) {
          const bonus = document.createElement("div");
          bonus.className = "bonus-float";
          bonus.textContent = bonusText;
          bonus.style.left = `${20 + Math.random() * (Math.max(20, window.innerWidth - 150) - 20)}px`;
          bonus.style.top = `${100 + Math.random() * (Math.max(100, window.innerHeight - 210) - 100)}px`;
          ($("bonus-layer") || document.body).appendChild(bonus);
          setTimeout(() => bonus.remove(), 850);
        }
      } finally { tapBusy = false; }
    };

    const end = (e) => { if (e.cancelable) e.preventDefault(); tapButton.className = "ready"; };
    tapButton.addEventListener("touchstart", start, { passive: false });
    tapButton.addEventListener("touchend", end, { passive: false });
    tapButton.addEventListener("touchcancel", end, { passive: false });
    tapButton.addEventListener("mousedown", start);
    tapButton.addEventListener("mouseup", end);
  }

  // Оживляем кнопки закрытия и открытия панелей
  const p = findPanelElement();
  if ($("close-panel") && p) $("close-panel").onclick = () => { p.classList.remove("open"); currentPanelType = null; };
  document.querySelectorAll(".bottom button").forEach(b => b.onclick = () => { openPanel(b.dataset.panel); });
});

// ГЛОБАЛЬНАЯ НАВИГАЦИЯ ПО ПАНЕЛЯМ (ПОЛНАЯ ИНФОРМАЦИЯ)
// ГЛОБАЛЬНАЯ НАВИГАЦИЯ ПО ПАНЕЛЯМ
function openPanel(t) {
  const p = findPanelElement(); if (!p) return; p.classList.add("open"); currentPanelType = t;
  if (t === "upgrades") upgradesPanel(); 
  if (t === "gems") gemsPanel();
  
  // ТВОЙ ОРИГИНАЛЬНЫЙ ЛИДЕРБОРД С РЕАЛЬНЫМ БАЛАНСОМ И ЗНАКОМ ДОЛЛАРА
  if (t === "rating") {
    $("panel-content").innerHTML = `
      <h2>🏆 Рейтинг Игроков</h2>
      <div class="row"><div>1. Топ Игрок</div><b>999999.00 $</b></div>
      <div class="row"><div>2. Тестировщик</div><b>50000.00 $</b></div>
      <div class="row"><div>Ваше место:</div><b>${Number(state.dollars).toFixed(2)} $</b></div>
      <div class="row" style="background:rgba(0,210,255,0.06); border-left:3px solid var(--blue); padding-left:5px;">
        <div>Ваше место:</div><b>${Number(state.dollars).toFixed(2)} $</b>
      </div>
    `;
  }
  
  if (t === "profile") {
    $("panel-content").innerHTML = `
      <h2>👤 Профиль Пользователя</h2>
@@ -96,7 +101,7 @@
  }
}

// КРАСИВЫЕ КАРТОЧКИ ОБЫЧНЫХ АПГРЕЙДОВ + КНОПКА MAX
// КАРТОЧКИ ОБЫЧНЫХ АПГРЕЙДОВ + КНОПКА MAX
async function upgradesPanel() {
  const d = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`);
  const content = $("panel-content");
@@ -125,7 +130,7 @@
  content.innerHTML = html;
}

// КРАСИВЫЕ КАРТОЧКИ КРИСТАЛЛЬНОГО МАГАЗИНА С РАСЧЕТОМ ПРОЦЕНТОВ И МНОЖИТЕЛЕЙ
// МАГАЗИН ГЕМОВ С АКТУАЛЬНЫМ БАЛАНСОМ КРИСТАЛЛОВ В ШАПКЕ
async function gemsPanel() {
  const d = await api(`/api/upgrades?user_id=${encodeURIComponent(uid)}`);
  const content = $("panel-content");
@@ -138,38 +143,42 @@

  content.innerHTML = `
    <h2>💎 G3MS Премиум Магазин</h2>
    <div style="text-align:center; margin:-10px 0 15px 0; font-size:16px; color:#aaa;">
      Ваш баланс: <b style="color:var(--purple); font-size:18px;">${Number(state.gems).toFixed(0)} 💎</b>
    </div>
    
    <div class="blue-menu">
      <div class="card upgrade-card">
        <h3>⚡ DOUBLE TAP (Шанс x2)</h3>
        <div class="upgrade-price">${upDouble.cost.toFixed(2)} 💎</div>
        <div class="upgrade-level">Уровень: <b>${upDouble.level}</b> (Шанс: ${(state.double_chance * 100).toFixed(0)}%)</div>
        <button style="background:var(--purple); width:100%; border:none; padding:12px; border-radius:12px; color:#fff; font-weight:bold;" onclick="buyGemUpgrade('double')">Прокачать</button>
      </div>
      <div class="card upgrade-card">
        <h3>🔥 MULTIPLIER (Множитель общего дохода)</h3>
        <div class="upgrade-price">${upMult.cost.toFixed(2)} 💎</div>
        <div class="upgrade-level">Уровень: <b>${upMult.level}</b> (Текущий множитель: x${state.income_multiplier})</div>
        <button style="background:var(--purple); width:100%; border:none; padding:12px; border-radius:12px; color:#fff; font-weight:bold;" onclick="buyGemUpgrade('multiplier')">Прокачать</button>
      </div>
      <div class="card upgrade-card">
        <h3>💎 GEM INCOME (Шанс дропа кристаллов)</h3>
        <div class="upgrade-price">${upGemInc.cost.toFixed(2)} 💎</div>
        <div class="upgrade-level">Уровень: <b>${upGemInc.level}</b> (Шанс выпадения: ${(state.gem_chance * 100).toFixed(0)}%)</div>
        <button style="background:var(--purple); width:100%; border:none; padding:12px; border-radius:12px; color:#fff; font-weight:bold;" onclick="buyGemUpgrade('gem_income')">Прокачать</button>
      </div>
    </div>`;
}

// Отправка запросов прокачки на бэкенд
async function sendUpgradeRequest(k, m = false) {
  const d = await api("/api/upgrades/buy", { method: "POST", body: JSON.stringify({ user_id: uid, kind: k, max: m }) });
  if (!d.ok) { toast("❌ Ошибка покупки апгрейда"); return; }
  render(d.player); 
  toast("✅ Успешно прокачано!");
  if (currentPanelType === "upgrades") upgradesPanel(); 
  if (currentPanelType === "gems") gemsPanel();
}

window.buy = k => sendUpgradeRequest(k, false);
window.buyMax = k => sendUpgradeRequest(k, true);
window.buyGemUpgrade = k => sendUpgradeRequest(k, false);
