const MODEL = "claude-haiku-5-5";

const INSTRUCTION = `You answer a question about a visitor using only the memories provided. Never invent a fact. If the memories do not contain the answer, say you do not have that memory.

Return JSON only, with no markdown, in this shape:
{"answer": string, "relevant": string[]}

answer is one or two short sentences.
relevant lists only the provided memories that directly answer the question. Copy each one exactly, without the speaker name. Leave out small talk and anything that was merely said in passing. If nothing answers the question, use an empty list.`;

function parseAnswer(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { answer: text.slice(0, 500) || "I do not have that memory.", relevant: [] };
  try {
    const parsed = JSON.parse(match[0]);
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim().slice(0, 500) : "";
    const relevant = Array.isArray(parsed.relevant)
      ? parsed.relevant
          .filter((line) => typeof line === "string")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    return { answer: answer || "I do not have that memory.", relevant };
  } catch {
    return { answer: text.slice(0, 500) || "I do not have that memory.", relevant: [] };
  }
}

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

export function handleAsk(req, res, env) {
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
      const question = String(body.question || "").slice(0, 300).trim();
      const memories = Array.isArray(body.memories)
        ? body.memories.filter((line) => typeof line === "string").slice(0, 24)
        : [];
      if (question.length < 2 || memories.length === 0) {
        send(res, 400, { error: "empty" });
        return;
      }
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
          max_tokens: 300,
          output_config: { effort: "low" },
          system: INSTRUCTION,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                name: typeof body.name === "string" ? body.name.slice(0, 40) : null,
                question,
                memories,
              }),
            },
          ],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        send(res, 502, { error: "model", detail: payload?.error?.message || `Claude returned ${response.status}` });
        return;
      }
      const text = (payload.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      send(res, 200, parseAnswer(text));
    })
    .catch(() => {
      if (!res.writableEnded) send(res, 500, { error: "ask_failed" });
    });
}
