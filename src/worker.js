// Proxy catre Gemini Interactions API. Cheia ramane doar aici (secret Cloudflare).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.5-flash-lite";

const PROMPT = `Esti un asistent de nutritie. Identifica alimentele din input (poza sau descriere text).
Pentru fiecare aliment estimeaza portia in grame si valorile nutritionale pentru acea portie.
Raspunde DOAR cu JSON conform schemei. Nume in romana. Daca nu e mancare, items=[].`;

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

async function analyze(request, env) {
  if (!env.APP_CODE || !env.GEMINI_API_KEY) return json({ error: "secrets_lipsa" }, 500);
  if (request.headers.get("x-app-code") !== env.APP_CODE) return json({ error: "cod_invalid" }, 401);
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
  if (!r.ok) return json({ error: "gemini_http", status: r.status, detail: raw.slice(0, 500) }, 502);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: "gemini_raspuns_invalid" }, 502); }
  const t = extractText(data);
  if (!t) return json({ error: "fara_output", detail: raw.slice(0, 500) }, 502);
  let parsed;
  try { parsed = JSON.parse(t); } catch { return json({ error: "output_nu_e_json", detail: t.slice(0, 300) }, 502); }
  return json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/analyze" && request.method === "POST") return analyze(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
