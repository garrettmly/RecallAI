const NAME_LIMIT = 40;
const RELATIONSHIP_LIMIT = 60;
const FACT_LIMIT = 140;

export function plausibleName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > NAME_LIMIT) return null;
  if (name.split(" ").length > 4) return null;
  if (!/[A-Za-z]/.test(name)) return null;
  if (/[!?]/.test(name)) return null;
  if ((name.match(/\./g) || []).length > 1) return null;
  return name;
}

export function plausibleRelationship(value) {
  if (typeof value !== "string") return null;
  const relationship = value.replace(/\s+/g, " ").trim().replace(/^your\s+/i, "");
  if (!relationship || relationship.length > RELATIONSHIP_LIMIT) return null;
  if (relationship.split(" ").length > 8) return null;
  if (!/[A-Za-z]/.test(relationship)) return null;
  if (/[!?]/.test(relationship)) return null;
  return relationship.charAt(0).toLowerCase() + relationship.slice(1);
}

export function cleanFacts(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const facts = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/g, " ").trim();
    if (text.length < 3 || text.length > FACT_LIMIT) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(text);
    if (facts.length === 6) break;
  }
  return facts;
}

export function parseModelText(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { name: null, relationship: null, facts: [], reminders: [] };
  }
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return {
      name: plausibleName(parsed.name),
      relationship: plausibleRelationship(parsed.relationship),
      facts: cleanFacts(parsed.facts),
      reminders: cleanFacts(parsed.reminders),
    };
  } catch {
    return { name: null, relationship: null, facts: [], reminders: [] };
  }
}

export function mergeCard(current, incoming) {
  const facts = [];
  const seen = new Set();
  const name = incoming.name || current.name || null;
  for (const text of [...(current.facts || []), ...(incoming.facts || [])]) {
    if (!text || (name && text.toLowerCase() === name.toLowerCase())) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(text);
  }
  const reminders = [];
  const seenReminders = new Set();
  for (const text of [...(current.reminders || []), ...(incoming.reminders || [])]) {
    if (!text) continue;
    const key = text.toLowerCase();
    if (seenReminders.has(key)) continue;
    seenReminders.add(key);
    reminders.push(text);
  }
  return {
    name,
    relationship: incoming.relationship || current.relationship || null,
    facts: facts.slice(-12),
    reminders: reminders.slice(-12),
  };
}
