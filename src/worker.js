// Proxy catre Gemini Interactions API. Cheia ramane doar aici (secret Cloudflare).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.5-flash-lite";

const PROMPT = `Esti un asistent de nutritie. Identifica alimentele din input (poza sau descriere text).
Pentru fiecare aliment estimeaza portia in grame si valorile nutritionale pentru acea portie.
Raspunde DOAR cu JSON conform schemei. Nume in romana. Daca nu e mancare, items=[].`;

const RECIPE_PROMPT = `Esti un asistent de nutritie. Primesti o reteta: un rand = un ingredient, cu sau fara cantitate.
Pentru fiecare ingredient estimeaza cantitatea in grame (daca lipseste, alege una rezonabila pentru numarul de portii dat) si valorile nutritionale pentru acea cantitate, asa cum e listat (crud daca nu scrie altfel).
Nu adauga ingrediente care nu sunt in lista si nu uni randuri. Nume in romana. Raspunde DOAR cu JSON conform schemei.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          kcal: { type: "number" },
          protein: { type: "number" },
          fat: { type: "number" },
          carbs: { type: "number" },
        },
        required: ["name", "grams", "kcal", "protein", "fat", "carbs"],
      },
    },
  },
  required: ["items"],
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export function extractText(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s?.type === "model_output" && Array.isArray(s.content)) {
      const t = s.content.filter((c) => c?.type === "text").map((c) => c.text).join("");
      if (t) return t;
    }
  }
  return null;
}

async function auth(request, env) {
  const lipsa = ["APP_CODE", "GEMINI_API_KEY"].filter((k) => typeof env[k] !== "string" || env[k].length === 0);
  if (lipsa.length) return json({ error: "secrets_lipsa", lipsa }, 500);
  if (request.headers.get("x-app-code") !== env.APP_CODE) return json({ error: "cod_invalid" }, 401);
  return null;
}

async function callGemini(env, input) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      model: MODEL,
      input,
      store: false,
      response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
    }),
  });
  const raw = await r.text();
  if (!r.ok) return { err: json({ error: "gemini_http", status: r.status, detail: raw.slice(0, 500) }, 502) };
  let data;
  try { data = JSON.parse(raw); } catch { return { err: json({ error: "gemini_raspuns_invalid" }, 502) }; }
  const t = extractText(data);
  if (!t) return { err: json({ error: "fara_output", detail: raw.slice(0, 500) }, 502) };
  let parsed;
  try { parsed = JSON.parse(t); } catch { return { err: json({ error: "output_nu_e_json", detail: t.slice(0, 300) }, 502) }; }
  return { items: cleanItems(parsed.items) };
}

export function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  return items.slice(0, 40).map((it) => ({
    name: String(it?.name ?? "").slice(0, 80) || "?",
    grams: num(it?.grams), kcal: num(it?.kcal), protein: num(it?.protein), fat: num(it?.fat), carbs: num(it?.carbs),
  }));
}

async function analyze(request, env) {
  const bad = await auth(request, env);
  if (bad) return bad;
  let body;
  try { body = await request.json(); } catch { return json({ error: "json_invalid" }, 400); }
  const { image, text } = body || {};
  const input = [{ type: "text", text: PROMPT }];
  if (typeof text === "string" && text.trim()) input.push({ type: "text", text: "Descriere: " + text.slice(0, 500) });
  if (typeof image === "string" && image.length > 0) {
    if (image.length > 6_000_000) return json({ error: "poza_prea_mare" }, 413);
    input.push({ type: "image", data: image, mime_type: "image/jpeg" });
  }
  if (input.length === 1) return json({ error: "input_gol" }, 400);
  const res = await callGemini(env, input);
  return res.err || json({ items: res.items });
}

async function recipe(request, env) {
  const bad = await auth(request, env);
  if (bad) return bad;
  let body;
  try { body = await request.json(); } catch { return json({ error: "json_invalid" }, 400); }
  const ingredients = typeof body?.ingredients === "string" ? body.ingredients.trim() : "";
  const servings = Math.round(Number(body?.servings));
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 80) : "";
  if (!ingredients) return json({ error: "ingrediente_goale" }, 400);
  if (ingredients.length > 2000) return json({ error: "ingrediente_prea_lungi" }, 413);
  const lines = ingredients.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length > 30) return json({ error: "prea_multe_ingrediente", max: 30 }, 400);
  if (!(servings >= 1 && servings <= 50)) return json({ error: "portii_invalide", min: 1, max: 50 }, 400);
  const input = [
    { type: "text", text: RECIPE_PROMPT },
    { type: "text", text: `Reteta: ${title || "fara titlu"}\nPortii: ${servings}\nIngrediente:\n${lines.join("\n")}` },
  ];
  const res = await callGemini(env, input);
  return res.err || json({ items: res.items });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/analyze" && request.method === "POST") return analyze(request, env);
    if (url.pathname === "/api/recipe" && request.method === "POST") return recipe(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
