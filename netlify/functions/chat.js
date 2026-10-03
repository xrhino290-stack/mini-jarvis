// Netlify Function: API key sirf yahan (server side) rehti hai.
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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(500, { error: "ANTHROPIC_API_KEY set nahi hai (Netlify env variables check karo)" });

  let messages;
  try {
    messages = JSON.parse(event.body || "{}").messages;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!Array.isArray(messages) || messages.length === 0) return json(400, { error: "messages missing hai" });

  const clean = messages
    .slice(-20)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.JARVIS_MODEL || "claude-sonnet-4-6",
        max_tokens: 300,
        system: SYSTEM,
        messages: clean,
      }),
    });
    const data = await res.json();
    if (!res.ok) return json(res.status, { error: data?.error?.message || "API error" });
    const reply = (data.content || []).map((b) => b.text || "").join("").trim();
    return json(200, { reply });
  } catch (e) {
    return json(500, { error: "Server error: " + e.message });
  }
};
