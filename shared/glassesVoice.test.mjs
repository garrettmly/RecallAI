import assert from "node:assert/strict";
import test from "node:test";
import { glassesCommand, recallUtterance } from "./glassesVoice.mjs";

test("matches the glasses note commands", () => {
  assert.equal(glassesCommand("minimize notes"), "pad-off");
  assert.equal(glassesCommand("open notes"), "pad-on");
  assert.equal(glassesCommand("minimize notes for the person"), "person-off");
  assert.equal(glassesCommand("expand notes for the person"), "person-on");
});

test("treats a spoken question as a question and leaves a normal sentence alone", () => {
  assert.equal(glassesCommand("where does he live"), "ask");
  assert.equal(glassesCommand("He brought the soup."), null);
  assert.equal(glassesCommand("do you want coffee"), null);
});

test("hears hey recall and keeps the question that follows", () => {
  assert.deepEqual(recallUtterance("hey recall"), { rest: "" });
  assert.deepEqual(recallUtterance("Hey Recall, where does he live"), { rest: "where does he live" });
  assert.equal(glassesCommand("hey recall"), "wake");
  assert.equal(recallUtterance("he brought the soup"), null);
});
