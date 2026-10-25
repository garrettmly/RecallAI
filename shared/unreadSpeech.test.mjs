import assert from "node:assert/strict";
import test from "node:test";
import { unreadSpeech } from "./unreadSpeech.mjs";

function line(text, isFinal) {
  return { 0: { transcript: text }, isFinal };
}

test("reads only the phrases that were not already heard", () => {
  const results = [line("I am Maya", true), line("your granddaughter", true), line("and I brought soup", false)];
  const first = unreadSpeech(results, 0);
  assert.equal(first.confirmed, "I am Maya your granddaughter");
  assert.equal(first.interim, "and I brought soup");
  assert.equal(first.emitted, 2);

  const again = unreadSpeech(results, first.emitted);
  assert.equal(again.confirmed, "");
  assert.equal(again.interim, "and I brought soup");
  assert.equal(again.emitted, 2);
});
