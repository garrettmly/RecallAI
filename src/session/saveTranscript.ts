import { mergeCard, reminderLine, taskFromLine, tasksFromSpeech } from "../../server/notes.mjs";
import type { Notes, Person } from "../types";

export function shouldExtract(pending: string, lastSpeechAt: number, lastExtractAt: number, now = Date.now()): boolean {
  const text = pending.trim();
  if (text.length < 8) return false;
  const quietFor = now - lastSpeechAt;
  const sinceExtract = now - lastExtractAt;
  const thoughtEnded = quietFor > 600;
  const longEnough = text.length >= 80;
  if (!thoughtEnded && !longEnough) return false;
  if (sinceExtract < 1500) return false;
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
  const reminders = [
    ...kept,
    ...incoming
      .filter((text) => {
        if (!text) return false;
        const key = text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((text) => ({ id: crypto.randomUUID(), text, at: now, done: false })),
  ].slice(-12);
  return {
    ...person,
    name: merged.name,
    relationship: merged.relationship,
    facts,
    reminders,
    excerpts: [...person.excerpts, { text: transcript.slice(0, 280), at: now }].slice(-8),
    updatedAt: now,
    lastSeenAt: now,
  };
}
