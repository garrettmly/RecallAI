export function unreadSpeech(results, from) {
  let confirmed = "";
  let interim = "";
  let emitted = from;
  for (let index = from; index < results.length; index += 1) {
    const result = results[index];
    const text = String(result?.[0]?.transcript || "").replace(/\s+/g, " ").trim();
    if (result?.isFinal) {
      if (text) confirmed = confirmed ? `${confirmed} ${text}` : text;
      emitted = index + 1;
    } else if (text) {
      interim = interim ? `${interim} ${text}` : text;
    }
  }
  return { confirmed, interim, emitted };
}
