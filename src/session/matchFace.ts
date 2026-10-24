import type { Person } from "../types";
import type { DetectedFace } from "../vision/match";
import { MAYBE_DISTANCE, MATCH_DISTANCE, STABLE_MS } from "../vision/thresholds";
import { bestMatch, euclidean } from "../../shared/distance.mjs";

export type StableFace = { descriptor: Float32Array; since: number };

export type FaceAction =
  | { type: "none" }
  | { type: "clear" }
  | { type: "match"; id: string; uncertain: boolean; saved: Person | null }
  | { type: "hold"; stable: StableFace }
  | { type: "new"; person: Person };

function blankPerson(descriptor: Float32Array): Person {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: null,
    relationship: null,
    facts: [],
    reminders: [],
    excerpts: [],
    descriptors: [Array.from(descriptor)],
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

export function updateFromFace(input: {
  face: DetectedFace | null;
  people: Person[];
  activeId: string | null;
  lastFaceAt: number;
  stable: StableFace | null;
  pending: string;
  lastSpeechAt: number;
  now?: number;
}): { lastFaceAt: number; action: FaceAction } {
  const now = input.now ?? Date.now();
  const face = input.face;
  if (!face) {
    if (input.activeId && now - input.lastFaceAt > 4000) {
      return { lastFaceAt: input.lastFaceAt, action: { type: "clear" } };
    }
    return { lastFaceAt: input.lastFaceAt, action: { type: "none" } };
  }

  const match = bestMatch(face.descriptor, input.people);
  if (match && match.distance <= MAYBE_DISTANCE) {
    const confident = match.distance <= MATCH_DISTANCE;
    let saved: Person | null = null;
    if (confident) {
      const person = input.people.find((item) => item.id === match.id);
      if (person) {
        const nearest = Math.min(...person.descriptors.map((saved) => euclidean(saved, face.descriptor)));
        const descriptors =
          person.descriptors.length < 5 && nearest > 0.18
            ? [...person.descriptors, Array.from(face.descriptor)]
            : person.descriptors;
        if (!(descriptors === person.descriptors && now - person.lastSeenAt < 5000)) {
          saved = {
            ...person,
            descriptors,
            lastSeenAt: now,
            updatedAt: descriptors === person.descriptors ? person.updatedAt : now,
          };
        }
      }
    }
    return {
      lastFaceAt: now,
      action: { type: "match", id: match.id, uncertain: !confident, saved },
    };
  }

  const stable = input.stable;
  if (!stable || euclidean(stable.descriptor, face.descriptor) > 0.35) {
    return {
      lastFaceAt: now,
      action: { type: "hold", stable: { descriptor: face.descriptor, since: now } },
    };
  }

  const spoke = input.pending.trim().length > 8 || now - input.lastSpeechAt < 8000;
  if (now - stable.since < STABLE_MS || !spoke) {
    return { lastFaceAt: now, action: { type: "none" } };
  }

  return { lastFaceAt: now, action: { type: "new", person: blankPerson(face.descriptor) } };
}
