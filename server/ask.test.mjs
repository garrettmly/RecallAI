import assert from "node:assert/strict";
import test from "node:test";
import { parseAnswer } from "./ask.mjs";

test("reads a normal answer", () => {
  const parsed = parseAnswer(
    '{"answer":"Garrett saw a friend from Minnesota.","relevant":["saw a friend from Minnesota"]}',
  );
  assert.equal(parsed.answer, "Garrett saw a friend from Minnesota.");
  assert.deepEqual(parsed.relevant, ["saw a friend from Minnesota"]);
});

test("pulls the sentence out of a cut-off JSON reply", () => {
  const parsed = parseAnswer(
    '{"answer":"Garrett saw a friend from Minnesota.","relevant":["it was fun because I was able to',
  );
  assert.equal(parsed.answer, "Garrett saw a friend from Minnesota.");
  assert.deepEqual(parsed.relevant, []);
});

test("does not show raw JSON when the answer cannot be read", () => {
  const parsed = parseAnswer('{"answer":');
  assert.equal(parsed.answer, "I do not have that memory.");
  assert.equal(parsed.answer.includes("{"), false);
});
