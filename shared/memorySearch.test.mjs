import assert from "node:assert/strict";
import test from "node:test";
import { searchMemories, usableNote } from "./memorySearch.mjs";

test("ranks a memory that shares the question's words", () => {
  const hits = searchMemories("what is the dog's name", [
    { who: "Mateo", text: "visits on Sundays" },
    { who: "Mateo", text: "has a dog named Pepper" },
  ]);
  assert.equal(hits[0].text, "has a dog named Pepper");
  assert.equal(hits.length, 1);
});

test("leaves out spoken chatter that only mentions the topic in passing", () => {
  const hits = searchMemories("what is the dog's name", [
    {
      who: "Mateo",
      kind: "said",
      text: "I was just saying hello and the dog walked by while we talked about the weather today",
    },
    { who: "Mateo", kind: "fact", text: "has a dog named Pepper" },
  ]);
  assert.deepEqual(hits.map((hit) => hit.text), ["has a dog named Pepper"]);
});

test("keeps a finished note and drops one that stops halfway", () => {
  assert.equal(usableNote("saw some family yesterday"), true);
  assert.equal(usableNote("it was fun because I was able to see my friend from"), false);
  assert.equal(usableNote("the transcript cuts off before saying where"), false);
});

test("returns nothing when no memory shares a word", () => {
  const hits = searchMemories("where did they go to school", [
    { who: "Ada", text: "brings oranges" },
  ]);
  assert.deepEqual(hits, []);
});
