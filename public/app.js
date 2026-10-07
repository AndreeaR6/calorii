const $ = (id) => document.getElementById(id);
const KEY = "calorii.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); return JSON.stringify(load()) === JSON.stringify(d); } catch { return false; } };
const day = (t) => new Date(t).toLocaleDateString("sv");
let pending = [];

try { $("code").value = localStorage.getItem("calorii.code") || ""; } catch {}

function render() {
  const d = load(), today = day(Date.now());
  const items = d.filter((e) => day(e.t) === today);
  $("tot").textContent = Math.round(items.reduce((s, e) => s + e.kcal, 0));
  const ul = $("log"); ul.textContent = "";
  d.slice().reverse().slice(0, 50).forEach((e) => {
    const li = document.createElement("li");
    li.textContent = `${day(e.t)} - ${e.name} ${Math.round(e.grams)}g: ${Math.round(e.kcal)} kcal (P${Math.round(e.protein)} G${Math.round(e.fat)} C${Math.round(e.carbs)}) `;
    const b = document.createElement("button"); b.textContent = "x"; b.style.width = "auto";
    b.onclick = () => { save(load().filter((x) => x.id !== e.id)); render(); };
    li.appendChild(b); ul.appendChild(li);
  });
}

function resize(file, max = 1000) {
  return new Promise((ok, no) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      ok(c.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => no(new Error("poza_ilizibila"));
    img.src = u;
  });
}

$("go").onclick = async () => {
  const code = $("code").value.trim();
  try { localStorage.setItem("calorii.code", code); } catch {}
  const f = $("file").files[0], text = $("desc").value.trim();
  if (!f && !text) { $("msg").textContent = "Adauga poza sau descriere."; return; }
  $("msg").className = "small"; $("msg").textContent = "Se calculeaza..."; $("res").textContent = "";
  try {
    const body = {};
    if (f) body.image = await resize(f);
    if (text) body.text = text;
    const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-app-code": code }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error + (j.status ? " (" + j.status + ")" : ""));
    pending = j.items;
    if (!pending.length) { $("msg").textContent = "Nu am gasit mancare."; return; }
    const d = load(), t = Date.now();
    pending.forEach((it, i) => d.push({ id: t + "-" + i, t, ...it }));
    const ok = save(d);
    $("msg").textContent = ok ? "Adaugat in jurnal (sterge cu x daca nu e corect):" : "ATENTIE: browserul nu salveaza datele (mod privat sau browser in aplicatie). Deschide in Safari.";
    pending.forEach((it) => {
      const p = document.createElement("div");
      p.textContent = `${it.name} ${Math.round(it.grams)}g: ${Math.round(it.kcal)} kcal`;
      $("res").appendChild(p);
    });
    render();
  } catch (e) { $("msg").className = "err"; $("msg").textContent = "Eroare: " + e.message; }
};

$("exp").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(load())], { type: "application/json" }));
  a.download = "calorii-" + day(Date.now()) + ".json"; a.click();
};
$("imp").onclick = () => $("impf").click();
$("impf").onchange = async (e) => {
  try { const d = JSON.parse(await e.target.files[0].text()); if (Array.isArray(d)) { save(d); render(); } } catch { $("msg").textContent = "Fisier invalid."; }
};
render();
