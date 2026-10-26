const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "what", "who", "when", "where", "why", "how",
  "does", "do", "did", "of", "to", "for", "and", "or", "in", "on", "with", "about", "their",
  "his", "her", "my", "me", "i", "you", "your", "please", "tell", "name", "called",
]);

function words(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((word) => word.replace(/'s$/, ""))
    .filter((word) => word.length > 1 && !STOP.has(word));
}

function scoreMemory(needed, text) {
  const hay = words(text);
  return needed.reduce((total, word) => {
    if (hay.some((item) => item === word || item.startsWith(word))) return total + 1;
    return total;
  }, 0);
}

function isRelevant(memory, needed) {
  const hay = words(memory.text);
  const matched = scoreMemory(needed, memory.text);
  if (!needed.length || !hay.length || matched === 0) return false;
  const halfTheQuestion = matched / needed.length >= 0.5;
  if (memory.kind === "said") {
    const mostlyAboutThis = matched / hay.length >= 0.25;
    return halfTheQuestion && hay.length <= 10 && mostlyAboutThis;
  }
  return halfTheQuestion || matched >= 2;
}

const DANGLING =
  /(?:^|\s)(?:from|to|and|because|but|or|the|a|an|my|of|with|for|was|able|into|about)$/i;

export function usableNote(text) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (line.length < 3 || line.length > 140) return false;
  if (line.split(/\s+/).length < 2) return false;
  if (/\btranscript\b|\bcuts?\s+off\b|\bincomplete\b/i.test(line)) return false;
  if (DANGLING.test(line)) return false;
  return true;
}

export function searchMemories(question, memories) {
  const needed = words(question);
  return memories
    .map((memory) => ({ ...memory, score: scoreMemory(needed, memory.text) }))
    .filter((memory) => isRelevant(memory, needed))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
