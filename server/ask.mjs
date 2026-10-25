import { usableNote } from "../shared/memorySearch.mjs";

const MODEL = "claude-haiku-5-5";

const INSTRUCTION = `You answer a question about a visitor using only the memories provided. Never invent a fact. If the memories do not contain the answer, say you do not have that memory.

Return JSON only, with no markdown, in this shape:
{"answer": string, "relevant": string[]}

answer is one short spoken sentence. Do not mention transcripts, cutoffs, or unfinished sentences. If the memories do not say the answer, say you do not have that memory.
relevant lists only the provided memories that directly answer the question. Copy each one exactly, without the speaker name. Leave out small talk, unfinished sentences, and anything that was merely said in passing. If nothing answers the question, use an empty list.`;

function plainAnswer(value) {
  const answer = String(value || "")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (!answer || answer.startsWith("{") || answer.includes('"relevant"')) return "";
  return answer;
}

export function parseAnswer(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1));
      const answer = plainAnswer(parsed.answer);
      const relevant = Array.isArray(parsed.relevant)
        ? parsed.relevant
            .filter((line) => typeof line === "string")
            .map((line) => line.trim())
            .filter((line) => usableNote(line))
            .slice(0, 4)
        : [];
      return { answer: answer || "I do not have that memory.", relevant };
    } catch {
      // A cut-off reply still has the answer text before the JSON breaks.
    }
  }
  const pulled = body.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/);
  const answer = plainAnswer(pulled ? pulled[1] : body.startsWith("{") ? "" : body);
  return { answer: answer || "I do not have that memory.", relevant: [] };
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
          max_tokens: 400,
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
