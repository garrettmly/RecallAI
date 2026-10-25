export type Card = {
  name: string | null;
  relationship: string | null;
  facts: string[];
  reminders: string[];
};

export function plausibleName(value: unknown): string | null;
export function plausibleRelationship(value: unknown): string | null;
export function cleanFacts(value: unknown): string[];
export function reminderLine(text: string, name?: string | null): string;
export function taskFromLine(text: string, name?: string | null): string;
export function tasksFromSpeech(transcript: string, name?: string | null): string[];
export function parseModelText(text: string): Card;
export function mergeCard(current: Card, incoming: Card): Card;
