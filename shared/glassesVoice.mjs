function spoken(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function recallUtterance(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const match = raw.match(/^(?:hey|hay|hi|ok|okay)[,.]?\s+recall(?:\s+ai)?\b[,:]?\s*(.*)$/i);
  if (!match) return null;
  return { rest: match[1].replace(/\s+/g, " ").trim() };
}

export function glassesCommand(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const said = spoken(raw);
  if (!said) return null;
  if (recallUtterance(raw)) return "wake";
  if (/(minimize|minimise|minize|hide|close).*\bnotes?\b.*\b(person|visitor)\b/.test(said)) return "person-off";
  if (/(expand|open|show).*\bnotes?\b.*\b(person|visitor)\b/.test(said)) return "person-on";
  if (/(minimize|minimise|minize|hide|close).*\bnotes?\b/.test(said)) return "pad-off";
  if (/(open|show|expand).*\bnotes?\b/.test(said)) return "pad-on";
  if (raw.includes("?") || /^(who|what|when|where|why|how)\b/.test(said)) return "ask";
  return null;
}
