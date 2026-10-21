const DAY_FULL = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];
const DAY_SHORT = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];
const SHIFTS = ["Өглөө (08–12)", "Өдөр (12–17)", "Орой (17–22)"];
const TYPES = ["Их, дээд сургуулийн оюутан", "Коллеж, МСҮТ-ийн сурагч", "Ахлах ангийн сурагч", "Төгссөн / ажил хайж буй", "Бусад"];
const STATUSES = ["Шинэ", "Холбогдсон", "Ажилд авсан", "Татгалзсан"];
const STATUS_CLASS = { "Шинэ": "s-new", "Холбогдсон": "s-contacted", "Ажилд авсан": "s-hired", "Татгалзсан": "s-rejected" };

const $ = id => document.getElementById(id);

function apiReady() {
  return typeof API_URL === "string" && /^https?:\/\//.test(API_URL);
}

// text/plain body нь CORS preflight үүсгэхгүй тул Apps Script-тэй шууд ажиллана.
async function api(action, data) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...(data || {}) })
    });
  } catch (e) {
    throw Object.assign(new Error("Интернэт холболтоо шалгана уу."), { code: "network" });
  }
  let json;
  try { json = await res.json(); } catch (e) {
    throw Object.assign(new Error("Сервер буруу хариу өглөө."), { code: "server" });
  }
  if (!json.ok) throw Object.assign(new Error(json.error || "Алдаа гарлаа."), { code: json.code });
  return json;
}

function msg(el, text, kind) {
  el.hidden = !text;
  el.className = "note " + (kind || "info");
  el.textContent = text || "";
}

function fmtDate(t) {
  if (!t) return "";
  const d = new Date(+t), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function chips(box, items, name, type) {
  items.forEach((t, i) => {
    const l = document.createElement("label");
    l.className = "chip";
    l.innerHTML = `<input type="${type || "checkbox"}" name="${name}" id="${name}_${i}"><span></span>`;
    l.querySelector("input").value = t;
    l.querySelector("span").textContent = t;
    box.appendChild(l);
  });
}
