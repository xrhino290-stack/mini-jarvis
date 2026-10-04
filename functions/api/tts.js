const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const onRequest = () => json(405, { error: "Use POST" });

export async function onRequestPost({ request, env }) {
  const key = env.GEMINI_API_KEY;
  if (!key) return json(500, { error: "GEMINI_API_KEY missing" });

  let text = "";
  try { text = String((await request.json()).text || "").slice(0, 500); } catch (e) {}
  if (!text) return json(400, { error: "text missing" });

  const voice = env.JARVIS_TTS_VOICE || "Charon";
  const style = env.JARVIS_TTS_STYLE ||
    "Speak like Jarvis, a calm, deep, polished AI butler. Warm, confident, natural pace, in Hinglish: ";
  const models = [env.JARVIS_TTS_MODEL || "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
  let last = { status: 502, error: "TTS failed" };

  for (const model of models) {
    try {
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: style + text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            },
          }),
        }
      );
      const d = await r.json();
      const part = ((d.candidates || [])[0]?.content?.parts || []).find((p) => p.inlineData);
      if (r.ok && part) return json(200, { audio: part.inlineData.data, rate: 24000 });
      last = { status: r.status, error: (d.error && d.error.message) || "No audio" };
    } catch (e) {
      last = { status: 502, error: e.message };
    }
  }
  return json(last.status === 429 ? 429 : 502, { error: last.error });
                                            }
