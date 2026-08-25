function render(player) {
  state = player;
  const dollarsEl = $("dollars");
  const energyEl = $("energy");
  const maxEnergyEl = $("max-energy");
  if (dollarsEl) dollarsEl.textContent = Number(player.dollars).toFixed(2);
  if (energyEl) energyEl.textContent = Math.floor(player.energy);
  if (maxEnergyEl) maxEnergyEl.textContent = Math.floor(player.max_energy);
  const cd = Number(player.tap_cd);
  if (cd > 0 && cooldownEnd <= Date.now()) setReady();
}

function updateCooldownIndicator(remaining) {
  const indicator = $("cooldown-indicator");
  const time = $("cooldown-time");
  if (!indicator || !time) return;
  if (remaining <= 0) {
    indicator.className = "cooldown-ready";
    time.textContent = "READY";
  } else {
    indicator.className = "cooldown-active";
    time.textContent = `${remaining.toFixed(2)}s`;
  }
}

function setReady() {
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  cooldownEnd = 0;
  if ($("tap-button")) $("tap-button").className = "ready";
  updateCooldownIndicator(0);
}

function startCooldown(seconds) {
  clearInterval(cooldownTimer);
  cooldownEnd = Date.now() + Number(seconds) * 1000;
  if ($("tap-button")) $("tap-button").className = "cooldown";
  function update() {
    const rem = Math.max(0, cooldownEnd - Date.now()) / 1000;
    updateCooldownIndicator(rem);
    if (rem <= 0) setReady();
  }
  update();
  cooldownTimer = setInterval(update, 20);
}

function findPanelElement() { return $("panel") || document.querySelector(".panel"); }
