import { INSTRUCTION } from "./prompt.mjs";
import { parseModelText } from "./notes.mjs";

const MODEL = "claude-haiku-5-5";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export function handleExtract(req, res, env) {
  if (req.method === "GET") {
    const key = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    send(res, 200, { ready: Boolean(key) });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "method" });
    return;
  }

  readBody(req)
    .then(async (body) => {
      const key = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (!key) {
        send(res, 503, { error: "missing_key" });
        return;
      }
      const transcript = String(body.transcript || "").slice(0, 4000).trim();
      if (transcript.length < 8) {
        send(res, 400, { error: "empty" });
        return;
      }
      const current = body.current && typeof body.current === "object" ? body.current : {};
      const model = env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || MODEL;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          output_config: { effort: "low" },
          system: INSTRUCTION,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                current: {
                  name: typeof current.name === "string" ? current.name : null,
                  relationship:
                    typeof current.relationship === "string" ? current.relationship : null,
                  facts: Array.isArray(current.facts)
                    ? current.facts.filter((fact) => typeof fact === "string").slice(0, 12)
                    : [],
                },
                transcript,
              }),
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          payload?.error?.message || `Claude returned ${response.status}`;
        send(res, 502, { error: "model", detail });
        return;
      }
      const text = (payload.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      send(res, 200, parseModelText(text));
    })
    .catch(() => {
      if (!res.writableEnded) send(res, 500, { error: "extract_failed" });
    });
}
