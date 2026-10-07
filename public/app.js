const $ = (id) => document.getElementById(id);
const KEY = "calorii.v1", RKEY = "calorii.recipes.v1";
const rd = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch { return []; } };
const wr = (k, d) => { try { localStorage.setItem(k, JSON.stringify(d)); return JSON.stringify(rd(k)) === JSON.stringify(d); } catch { return false; } };
const load = () => rd(KEY), save = (d) => wr(KEY, d);
const loadR = () => rd(RKEY), saveR = (d) => wr(RKEY, d);
const day = (t) => new Date(t).toLocaleDateString("sv");
const sum = (a, k) => a.reduce((s, e) => s + (Number(e[k]) || 0), 0);
const rnd = (n) => Math.round(Number(n) || 0);
const getGoal = () => { try { return Number(localStorage.getItem("calorii.goal")) || 2000; } catch { return 2000; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  kids.forEach((k) => e.append(k));
  return e;
}
function setMsg(id, text, isErr) { const m = $(id); m.className = "msg" + (isErr ? " err" : ""); m.textContent = text; }
async function api(path, body) {
  let code = ""; try { code = localStorage.getItem("calorii.code") || ""; } catch {}
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-app-code": code }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 || j.error === "cod_invalid") {
      tab("azi");
      $("codeCard").hidden = false;
      setMsg("ccmsg", "Cod lipsa sau gresit - introdu-l aici.", true);
      $("code2").focus();
    }
    throw new Error((j.error || "eroare") + (j.status ? " (" + j.status + ")" : ""));
  }
  return j;
}

/* ---------- tab-uri ---------- */
function tab(name) {
  $("pageAzi").hidden = name !== "azi";
  $("pageRet").hidden = name !== "ret";
  $("tabAzi").className = name === "azi" ? "on" : "";
  $("tabRet").className = name === "ret" ? "on" : "";
  window.scrollTo(0, 0);
  if (name === "ret") renderList();
}
$("tabAzi").onclick = () => tab("azi");
$("tabRet").onclick = () => tab("ret");

/* ---------- Azi ---------- */
try { $("code").value = localStorage.getItem("calorii.code") || ""; } catch {}
const saveCode = (v) => { try { localStorage.setItem("calorii.code", v.trim()); } catch {} };
$("codeCard").hidden = !!$("code").value;
$("code2").value = $("code").value;
$("code").oninput = () => { saveCode($("code").value); $("code2").value = $("code").value; };
$("code2").oninput = () => { saveCode($("code2").value); $("code").value = $("code2").value; setMsg("ccmsg", "", false); };
$("code2").onchange = () => { if ($("code2").value.trim()) $("codeCard").hidden = true; };
$("goal").value = getGoal();
$("goal").onchange = () => {
  const v = Math.max(800, Math.min(6000, Number($("goal").value) || 2000));
  $("goal").value = v;
  try { localStorage.setItem("calorii.goal", String(v)); } catch {}
  render();
};

function scaleItem(x, g) {
  const f = g / x.grams;
  return { ...x, grams: g, kcal: x.kcal * f, protein: x.protein * f, fat: x.fat * f, carbs: x.carbs * f };
}
function gramInput(grams, onValid) {
  const gi = el("input", { type: "number", className: "gi", min: "1", max: "5000", inputMode: "numeric", value: String(rnd(grams)) });
  gi.setAttribute("aria-label", "Grame");
  gi.onchange = () => {
    const g = Number(gi.value);
    if (!(g >= 1 && g <= 5000) || !(grams > 0)) { gi.value = String(rnd(grams)); return; }
    onValid(g);
  };
  return gi;
}

function render() {
  const items = load().filter((e) => day(e.t) === day(Date.now()));
  const kcal = sum(items, "kcal"), goal = getGoal();
  $("tot").textContent = rnd(kcal);
  $("mp").textContent = rnd(sum(items, "protein")) + " g";
  $("mf").textContent = rnd(sum(items, "fat")) + " g";
  $("mc").textContent = rnd(sum(items, "carbs")) + " g";
  $("arc").setAttribute("stroke-dasharray", `${(352 * Math.min(1, kcal / goal)).toFixed(1)} 352`);
  const box = $("log"); box.textContent = "";
  if (!items.length) { box.append(el("div", { className: "empty", textContent: "Nimic adaugat azi." })); return; }
  items.slice().reverse().forEach((e) => {
    const time = new Date(e.t).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
    const gi = gramInput(e.grams, (g) => { save(load().map((x) => (x.id === e.id ? scaleItem(x, g) : x))); render(); });
    const d = el("div", { className: "d" }, time + " - ", gi, ` g - P${rnd(e.protein)} G${rnd(e.fat)} C${rnd(e.carbs)}`);
    const del = el("button", { className: "x", textContent: "x" });
    del.setAttribute("aria-label", "Sterge");
    del.onclick = () => { save(load().filter((x) => x.id !== e.id)); render(); };
    box.append(el("div", { className: "meal" }, el("div", { className: "grow" }, el("div", { className: "n", textContent: e.name }), d), el("div", { className: "k", textContent: rnd(e.kcal) + " kcal" }), del));
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

let chosenFile = null;
const pick = (e) => { chosenFile = e.target.files[0] || null; $("chosen").textContent = chosenFile ? "Poza aleasa: " + chosenFile.name : ""; };
$("fileCam").onchange = pick;
$("fileGal").onchange = pick;

$("go").onclick = async () => {
  try { localStorage.setItem("calorii.code", $("code").value.trim()); } catch {}
  const f = chosenFile, text = $("desc").value.trim();
  if (!f && !text) { setMsg("msg", "Adauga poza sau descriere.", false); return; }
  setMsg("msg", "Se calculeaza...", false);
  try {
    const body = {};
    if (f) body.image = await resize(f);
    if (text) body.text = text;
    const j = await api("/api/analyze", body);
    if (!j.items.length) { setMsg("msg", "Nu am gasit mancare.", false); return; }
    const d = load(), t = Date.now();
    j.items.forEach((it, i) => d.push({ id: t + "-" + i, t, ...it }));
    const ok = save(d);
    setMsg("msg", ok ? "Adaugat. Daca nu e corect, sterge cu x." : "ATENTIE: browserul nu salveaza datele (mod privat sau browser in aplicatie). Deschide in Safari.", !ok);
    $("desc").value = ""; $("fileCam").value = ""; $("fileGal").value = ""; chosenFile = null; $("chosen").textContent = "";
    render();
  } catch (e) { setMsg("msg", "Eroare: " + e.message, true); }
};

/* ---------- export / import (v2: jurnal + retete) ---------- */
$("exp").onclick = () => {
  const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify({ v: 2, diary: load(), recipes: loadR() })], { type: "application/json" })), download: "calorii-" + day(Date.now()) + ".json" });
  a.click();
};
$("imp").onclick = () => $("impf").click();
const okItem = (x) => x && typeof x.name === "string" && ["grams", "kcal", "protein", "fat", "carbs"].every((k) => Number.isFinite(Number(x[k])));
$("impf").onchange = async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    const diary = Array.isArray(d) ? d : d && Array.isArray(d.diary) ? d.diary : null;
    const recipes = d && !Array.isArray(d) && Array.isArray(d.recipes) ? d.recipes : null;
    if (!diary && !recipes) throw new Error("format");
    if (diary) { if (!diary.every((x) => okItem(x) && x.id != null && Number.isFinite(Number(x.t)))) throw new Error("jurnal"); save(diary); }
    if (recipes) { if (!recipes.every((r) => r && r.id && typeof r.title === "string" && Array.isArray(r.items) && r.items.every(okItem) && r.servings >= 1)) throw new Error("retete"); saveR(recipes); }
    setMsg("dmsg", "Importat.", false); render(); renderList();
  } catch { setMsg("dmsg", "Fisier invalid, nu am schimbat nimic.", true); }
  e.target.value = "";
};

/* ---------- Retete ---------- */
let draft = null; // {id|null, title, servings, items[]}
const newDraft = () => ({ id: null, title: "", servings: 2, items: [] });
const servingsVal = () => Math.max(1, Math.min(50, Math.round(Number($("rServ").value) || 1)));

function totals(items) { return { kcal: sum(items, "kcal"), protein: sum(items, "protein"), fat: sum(items, "fat"), carbs: sum(items, "carbs"), grams: sum(items, "grams") }; }
function tile(v, label) { return el("div", {}, el("b", { textContent: v }), el("span", { textContent: label })); }

function renderDraft() {
  $("edTitleH").textContent = draft.id ? "Editeaza reteta" : "Reteta noua";
  $("rResult").hidden = !draft.items.length;
  const box = $("rItems"); box.textContent = "";
  draft.items.forEach((it, i) => {
    const gi = gramInput(it.grams, (g) => { draft.items[i] = scaleItem(it, g); renderDraft(); });
    const del = el("button", { className: "x", textContent: "x" });
    del.setAttribute("aria-label", "Scoate ingredientul");
    del.onclick = () => { draft.items.splice(i, 1); renderDraft(); };
    box.append(el("div", { className: "meal" }, el("div", { className: "grow" }, el("div", { className: "n", textContent: it.name }), el("div", { className: "d" }, gi, ` g - P${rnd(it.protein)} G${rnd(it.fat)} C${rnd(it.carbs)}`)), el("div", { className: "k", textContent: rnd(it.kcal) + " kcal" }), del));
  });
  const t = totals(draft.items), s = servingsVal();
  const tb = $("rTot"); tb.textContent = "";
  tb.append(tile(rnd(t.kcal / s), "kcal / portie"), tile(rnd(t.protein / s) + " g", "proteine"), tile(rnd(t.fat / s) + " g", "grasimi"), tile(rnd(t.carbs / s) + " g", "carbo"));
}

$("rServ").onchange = () => { $("rServ").value = servingsVal(); if (draft) { draft.servings = servingsVal(); renderDraft(); } };

$("rCalc").onclick = async () => {
  try { localStorage.setItem("calorii.code", $("code").value.trim()); } catch {}
  const ingredients = $("rIng").value.trim();
  if (!ingredients) { setMsg("rMsg", "Scrie ingredientele, unul pe rand.", false); return; }
  if (ingredients.split(/\n/).filter((x) => x.trim()).length > 30) { setMsg("rMsg", "Maxim 30 de ingrediente.", true); return; }
  setMsg("rMsg", "Se calculeaza...", false);
  try {
    const j = await api("/api/recipe", { title: $("rTitle").value.trim(), servings: servingsVal(), ingredients });
    if (!j.items.length) { setMsg("rMsg", "Nu am gasit ingrediente.", false); return; }
    draft.items = j.items; draft.title = $("rTitle").value.trim(); draft.servings = servingsVal();
    setMsg("rMsg", "Verifica gramajele, apoi salveaza.", false);
    renderDraft();
  } catch (e) { setMsg("rMsg", "Eroare: " + e.message, true); }
};

function resetDraft() {
  draft = newDraft();
  $("rTitle").value = ""; $("rServ").value = 2; $("rIng").value = ""; setMsg("rMsg", "", false);
  renderDraft();
}
$("rReset").onclick = resetDraft;

$("rSave").onclick = () => {
  const title = $("rTitle").value.trim();
  if (!title) { setMsg("rMsg", "Da un nume retetei.", true); return; }
  if (!draft.items.length) { setMsg("rMsg", "Calculeaza intai reteta.", true); return; }
  const rec = { id: draft.id || uid(), title, servings: servingsVal(), items: draft.items, ingredients: $("rIng").value, t: Date.now() };
  const all = loadR(), i = all.findIndex((r) => r.id === rec.id);
  if (i >= 0) all[i] = rec; else all.push(rec);
  const ok = saveR(all);
  setMsg("rMsg", ok ? "Reteta salvata." : "ATENTIE: browserul nu salveaza datele. Deschide in Safari.", !ok);
  if (ok) { draft.id = rec.id; renderDraft(); renderList(); }
};

function addPortion(rec, portions, btn) {
  const p = Number(portions);
  if (!(p > 0 && p <= rec.servings * 4)) { btn.textContent = "Portii invalide"; return; }
  const t = totals(rec.items), f = p / rec.servings, now = Date.now();
  const d = load();
  d.push({ id: now + "-r" + rec.id, t: now, name: rec.title + (p === 1 ? "" : ` (${p} portii)`), grams: t.grams * f, kcal: t.kcal * f, protein: t.protein * f, fat: t.fat * f, carbs: t.carbs * f });
  const ok = save(d);
  btn.textContent = ok ? "Adaugat in jurnal" : "Nu s-a salvat";
  render();
}

function renderList() {
  const q = $("rSearch").value.trim().toLowerCase();
  const all = loadR().filter((r) => r.title.toLowerCase().includes(q)).sort((a, b) => b.t - a.t);
  const box = $("rList"); box.textContent = "";
  if (!all.length) { box.append(el("div", { className: "empty", textContent: q ? "Nicio reteta gasita." : "Nu ai retete salvate inca." })); return; }
  all.forEach((r) => {
    const t = totals(r.items), s = r.servings;
    const pin = el("input", { type: "number", min: "0.5", step: "0.5", value: "1" });
    pin.setAttribute("aria-label", "Numar portii");
    const add = el("button", { className: "btn s sm", textContent: "Adauga in jurnal" });
    add.onclick = () => addPortion(r, pin.value, add);
    const edit = el("button", { className: "btn s sm", textContent: "Editeaza" });
    edit.onclick = () => {
      draft = { id: r.id, title: r.title, servings: r.servings, items: r.items.map((x) => ({ ...x })) };
      $("rTitle").value = r.title; $("rServ").value = r.servings; $("rIng").value = r.ingredients || r.items.map((x) => `${rnd(x.grams)} g ${x.name}`).join("\n");
      setMsg("rMsg", "", false); renderDraft(); window.scrollTo(0, 0);
    };
    const del = el("button", { className: "btn d sm", textContent: "Sterge" });
    del.onclick = () => {
      if (del.dataset.arm !== "1") { del.dataset.arm = "1"; del.textContent = "Sigur?"; return; }
      saveR(loadR().filter((x) => x.id !== r.id));
      if (draft && draft.id === r.id) resetDraft();
      renderList();
    };
    box.append(el("div", { className: "rc" },
      el("div", { className: "t", textContent: r.title }),
      el("div", { className: "s", textContent: `${s} ${s === 1 ? "portie" : "portii"} - ${rnd(t.kcal / s)} kcal/portie - P${rnd(t.protein / s)} G${rnd(t.fat / s)} C${rnd(t.carbs / s)}` }),
      el("div", { className: "acts" }, pin, add, edit, del)));
  });
}
$("rSearch").oninput = renderList;

resetDraft();
render();
renderList();
