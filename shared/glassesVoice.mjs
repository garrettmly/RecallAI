function spoken(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(text, word) {
  return ` ${text} `.includes(` ${word} `);
}

function anyWord(text, words) {
  return words.some((word) => hasWord(text, word));
}

export function recallUtterance(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const lower = raw.toLowerCase();
  const hello = ["hey", "hay", "hi", "ok", "okay"].find((word) => {
    return lower.startsWith(`${word} `) || lower.startsWith(`${word},`) || lower.startsWith(`${word}.`);
  });
  if (!hello) return null;
  let rest = raw.slice(hello.length).replace(/^[,.\s]+/, "");
  if (!rest.toLowerCase().startsWith("recall")) return null;
  rest = rest.slice("recall".length).replace(/^[,:\s]+/, "");
  if (rest.toLowerCase().startsWith("ai") && (rest.length === 2 || /^[,:\s]/.test(rest.slice(2)))) {
    rest = rest.slice(2).replace(/^[,:\s]+/, "");
  }
  return { rest: rest.trim() };
}

export function glassesCommand(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  const said = spoken(raw);
  if (!said) return null;
  if (recallUtterance(raw)) return "wake";
  const aboutPerson = hasWord(said, "person") || hasWord(said, "visitor");
  const aboutNotes = hasWord(said, "note") || hasWord(said, "notes");
  const hide = anyWord(said, ["minimize", "minimise", "minize", "hide", "close"]);
  const show = anyWord(said, ["expand", "open", "show"]);
  if (aboutPerson && aboutNotes && hide) return "person-off";
  if (aboutPerson && aboutNotes && show) return "person-on";
  if (aboutNotes && hide) return "pad-off";
  if (aboutNotes && show) return "pad-on";
  const first = said.split(" ")[0];
  if (raw.includes("?") || ["who", "what", "when", "where", "why", "how"].includes(first)) return "ask";
  return null;
}
