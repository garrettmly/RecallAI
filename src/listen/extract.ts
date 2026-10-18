import type { Notes } from "../types";

export async function extractNotes(input: {
  transcript: string;
  current: Notes;
}): Promise<Notes | { error: string; detail?: string }> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as Notes & {
    error?: string;
    detail?: string;
  };
  if (!response.ok) {
    return { error: body.error || "extract_failed", detail: body.detail };
  }
  return {
    name: body.name ?? null,
    relationship: body.relationship ?? null,
    facts: Array.isArray(body.facts) ? body.facts : [],
    reminders: Array.isArray(body.reminders) ? body.reminders : [],
  };
}
