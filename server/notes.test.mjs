import assert from "node:assert/strict";
import test from "node:test";
import { mergeCard, parseModelText, plausibleName } from "./notes.mjs";

test("reads fenced JSON and drops a sentence that is not a name", () => {
  const notes = parseModelText(`Here you go:
\`\`\`json
{"name":"I am your grandson Mateo and I brought soup","relationship":"Your grandson","facts":["has a dog named Pepper","has a dog named Pepper"]}
\`\`\``);
  assert.equal(notes.name, null);
  assert.equal(notes.relationship, "grandson");
  assert.deepEqual(notes.facts, ["has a dog named Pepper"]);
});

test("keeps a short spoken name and merges without duplicates", () => {
  const notes = parseModelText(
    '{"name":"Mateo","relationship":"grandson","facts":["visits on Sundays"]}',
  );
  assert.equal(plausibleName("Mateo"), "Mateo");
  const merged = mergeCard(
    { name: "Mateo", relationship: null, facts: ["visits on Sundays"] },
    notes,
  );
  assert.equal(merged.name, "Mateo");
  assert.equal(merged.relationship, "grandson");
  assert.deepEqual(merged.facts, ["visits on Sundays"]);
});

test("does not wipe an existing name when the model is unsure", () => {
  const merged = mergeCard(
    { name: "Ada", relationship: "neighbor", facts: ["brings oranges"] },
    { name: null, relationship: null, facts: ["asked about the garden"] },
  );
  assert.equal(merged.name, "Ada");
  assert.equal(merged.relationship, "neighbor");
  assert.deepEqual(merged.facts, ["brings oranges", "asked about the garden"]);
});
