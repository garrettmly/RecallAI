import assert from "node:assert/strict";
import test from "node:test";
import { bestMatch, euclidean } from "./distance.mjs";

test("identical faces have distance zero and match the right person", () => {
  const mateo = [1, 0, 0];
  const ada = [0, 1, 0];
  assert.equal(euclidean(mateo, mateo), 0);
  const match = bestMatch(mateo, [
    { id: "ada", descriptors: [ada] },
    { id: "mateo", descriptors: [mateo] },
  ]);
  assert.deepEqual(match, { id: "mateo", distance: 0 });
});

test("returns null when nobody is saved yet", () => {
  assert.equal(bestMatch([1, 2, 3], []), null);
});
