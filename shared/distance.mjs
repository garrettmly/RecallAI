export function euclidean(left, right) {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

export function bestMatch(descriptor, people) {
  let best = null;
  for (const person of people) {
    for (const saved of person.descriptors) {
      const distance = euclidean(descriptor, saved);
      if (!best || distance < best.distance) {
        best = { id: person.id, distance };
      }
    }
  }
  return best;
}
