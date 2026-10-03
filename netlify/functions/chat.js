// Netlify Function (Gemini free tier): API key sirf yahan (server side) rehti hai.
const SYSTEM = `Tum Jarvis ho, ek helpful voice assistant.
Hamesha Hinglish (Hindi + English, Roman script) me jawab do.
Jawab chhote rakho (max 2-3 sentences) kyunki ye bol kar sunaya jayega.
Markdown, emoji ya lists mat use karo. Dost jaisa, polite tone rakho.`;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

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

  const model = process.env.JARVIS_MODEL || "gemini-2.5-flash";
  const generationConfig = { maxOutputTokens: 400 };
  if (model.startsWith("gemini-2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig,
        }),
      }
    );
    const data = await res.json();
    if (res.status === 429) return json(429, { error: "Free limit khatam ho gayi, thodi der baad try karo." });
    if (!res.ok) return json(res.status, { error: data?.error?.message || "API error" });
    const reply = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return json(200, { reply: reply || "Maaf karna, jawab nahi mila. Dobara bolo." });
  } catch (e) {
    return json(500, { error: "Server error: " + e.message });
  }
};
