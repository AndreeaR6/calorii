const $ = (id) => document.getElementById(id);
const KEY = "calorii.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); return JSON.stringify(load()) === JSON.stringify(d); } catch { return false; } };
const day = (t) => new Date(t).toLocaleDateString("sv");
const sum = (a, k) => a.reduce((s, e) => s + (Number(e[k]) || 0), 0);
const getGoal = () => { try { return Number(localStorage.getItem("calorii.goal")) || 2000; } catch { return 2000; } };

try { $("code").value = localStorage.getItem("calorii.code") || ""; } catch {}
$("goal").value = getGoal();
$("goal").onchange = () => {
  const v = Math.max(800, Math.min(6000, Number($("goal").value) || 2000));
  $("goal").value = v;
  try { localStorage.setItem("calorii.goal", String(v)); } catch {}
  render();
};

function render() {
  const items = load().filter((e) => day(e.t) === day(Date.now()));
  const kcal = sum(items, "kcal"), goal = getGoal();
  $("tot").textContent = Math.round(kcal);
  $("mp").textContent = Math.round(sum(items, "protein")) + " g";
  $("mf").textContent = Math.round(sum(items, "fat")) + " g";
  $("mc").textContent = Math.round(sum(items, "carbs")) + " g";
  const frac = Math.min(1, kcal / goal);
  $("arc").setAttribute("stroke-dasharray", `${(352 * frac).toFixed(1)} 352`);
  const box = $("log"); box.textContent = "";
  if (!items.length) { const p = document.createElement("div"); p.className = "empty"; p.textContent = "Nimic adaugat azi."; box.appendChild(p); return; }
  items.slice().reverse().forEach((e) => {
    const row = document.createElement("div"); row.className = "meal";
    const l = document.createElement("div");
    const n = document.createElement("div"); n.className = "n"; n.textContent = e.name;
    const d = document.createElement("div"); d.className = "d";
    d.textContent = `${new Date(e.t).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })} - ${Math.round(e.grams)} g - P${Math.round(e.protein)} G${Math.round(e.fat)} C${Math.round(e.carbs)}`;
    l.append(n, d);
    const k = document.createElement("div"); k.className = "k"; k.textContent = Math.round(e.kcal) + " kcal";
    const b = document.createElement("button"); b.className = "x"; b.textContent = "x"; b.setAttribute("aria-label", "Sterge");
    b.onclick = () => { save(load().filter((x) => x.id !== e.id)); render(); };
    row.append(l, k, b); box.appendChild(row);
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

$("file").onchange = () => { $("photoBtn").textContent = $("file").files[0] ? "Poza aleasa" : "Poza cu mancare"; };

$("go").onclick = async () => {
  const code = $("code").value.trim();
  try { localStorage.setItem("calorii.code", code); } catch {}
  const f = $("file").files[0], text = $("desc").value.trim();
  $("msg").className = ""; 
  if (!f && !text) { $("msg").textContent = "Adauga poza sau descriere."; return; }
  $("msg").textContent = "Se calculeaza...";
  try {
    const body = {};
    if (f) body.image = await resize(f);
    if (text) body.text = text;
    const r = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json", "x-app-code": code }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error + (j.status ? " (" + j.status + ")" : ""));
    const items = j.items;
    if (!items.length) { $("msg").textContent = "Nu am gasit mancare."; return; }
    const d = load(), t = Date.now();
    items.forEach((it, i) => d.push({ id: t + "-" + i, t, ...it }));
    const ok = save(d);
    $("msg").className = ok ? "" : "err";
    $("msg").textContent = ok ? "Adaugat. Daca nu e corect, sterge cu x." : "ATENTIE: browserul nu salveaza datele (mod privat sau browser in aplicatie). Deschide in Safari.";
    $("desc").value = ""; $("file").value = ""; $("photoBtn").textContent = "Poza cu mancare";
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
  try { const d = JSON.parse(await e.target.files[0].text()); if (Array.isArray(d)) { save(d); render(); } } catch { $("msg").className = "err"; $("msg").textContent = "Fisier invalid."; }
};
render();
