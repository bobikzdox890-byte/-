window.onerror = function(message, source, lineno) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:15px;font-size:14px;">JS ERROR:<br>${message}<br>Line: ${lineno}</div>`
  );
};

const RENDER_URL = window.location.origin; 
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

async function api(url, options = {}) {
  try {
    const fetchOptions = {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json; charset=utf-8" }
    };
    if (options.body) fetchOptions.body = options.body;
    const response = await fetch(RENDER_URL + url, fetchOptions);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: "api_error" }; }
    return data;
  } catch (error) {
    toast("❌ Нет связи с сервером");
    return { ok: false, error: "connection" };
  }
}

