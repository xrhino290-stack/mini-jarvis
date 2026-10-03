// Netlify Function (Gemini free tier) with auto-retry + fallback models
const SYSTEM = `Tum Jarvis ho, ek helpful voice assistant.
Hamesha Hinglish (Hindi + English, Roman script) me jawab do.
User ka text voice se aata hai, to kabhi Devanagari me ya galat spelling me ho sakta hai. Matlab samajh kar jawab do.
Jawab chhote rakho (max 2-3 sentences) kyunki ye bol kar sunaya jayega.
Markdown, emoji ya lists mat use karo. Dost jaisa, polite tone rakho.`;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const FALLBACKS = (process.env.JARVIS_FALLBACKS || "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);
const RETRY_STATUS = [429, 500, 503, 504];
const BUDGET_MS = 8500;

async function callModel(model, key, body, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      }
    );
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Sirf POST allowed hai" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, { error: "GEMINI_API_KEY set nahi hai (Netlify env variables check karo)" });

  let messages;
  try {
    messages = JSON.parse(event.body || "{}").messages;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!Array.isArray(messages) || messages.length === 0) return json(400, { error: "messages missing hai" });

  const contents = messages
    .slice(-20)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 1000) }],
    }));

  const body = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: { maxOutputTokens: 800 },
  };

  const primary = process.env.JARVIS_MODEL || "gemini-3.8-flash";
  const models = [...new Set([primary, ...FALLBACKS])];
  const start = Date.now();

  for (const model of models) {
    const remaining = BUDGET_MS - (Date.now() - start);
    if (remaining < 1500) break;
    try {
      const { res, data } = await callModel(model, key, body, Math.min(remaining, 4500));
      if (res.ok) {
        const reply = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
        if (reply) return json(200, { reply });
        continue;
      }
      if (RETRY_STATUS.includes(res.status) || res.status === 404) continue;
      return json(res.status, { error: data?.error?.message || "API error" });
    } catch (e) {
      continue;
    }
  }
  return json(503, { error: "Google ke server pe abhi bheed hai. 1 minute baad dobara bolo." });
};
