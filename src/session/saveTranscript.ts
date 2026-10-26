import { mergeCard, reminderLine, taskFromLine, tasksFromSpeech } from "../../server/notes.mjs";
import type { Notes, Person } from "../types";

export function shouldExtract(
  pending: string,
  lastSpeechAt: number,
  lastExtractAt: number,
  now = Date.now(),
  phraseEnded = false,
): boolean {
  const text = pending.trim();
  if (text.length < 8) return false;
  // A finished phrase sends immediately. Live speech still waits for a short pause so a word is not cut in half.
  if (!phraseEnded && now - lastSpeechAt < 280 && text.length < 40) return false;
  if (now - lastExtractAt < 350) return false;
  return true;
}

export function applyNotes(person: Person, notes: Notes, transcript: string, now = Date.now()): Person {
  const plainFacts = notes.facts.filter((text) => !taskFromLine(text, person.name));
  const merged = mergeCard(
    {
      name: person.name,
      relationship: person.relationship,
      facts: person.facts.map((fact) => fact.text),
      reminders: (person.reminders ?? []).map((item) => item.text),
    },
    { ...notes, facts: plainFacts },
  );
  const facts = merged.facts.map((text: string) => {
    const found = person.facts.find((fact) => fact.text.toLowerCase() === text.toLowerCase());
    return found ?? { id: crypto.randomUUID(), text, at: now };
  });
  const kept = person.reminders ?? [];
  const seen = new Set(kept.map((item) => reminderLine(item.text, person.name).toLowerCase()));
  const incoming = [
    ...notes.reminders.map((text) => reminderLine(text, person.name)),
    ...notes.facts.map((text) => taskFromLine(text, person.name)),
    ...tasksFromSpeech(transcript, person.name),
  ];
  const reminders = [...kept];
  for (const text of incoming) {
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    reminders.push({ id: crypto.randomUUID(), text, at: now, done: false });
  }
  return {
    ...person,
    name: merged.name,
    relationship: merged.relationship,
    facts,
    reminders: reminders.slice(-12),
    excerpts: [...person.excerpts, { text: transcript.slice(0, 280), at: now }].slice(-8),
    updatedAt: now,
    lastSeenAt: now,
  };
}
