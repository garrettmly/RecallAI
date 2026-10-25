# Recall AI agent guide

Recall AI is a laptop web app for a household supporting someone with dementia. A visitor sits down, the camera matches their face, and the microphone turns the conversation into a name, a relationship, facts, and reminders. Nobody creates a profile first.

Read `README.md` for the demo story. This file is how to change the code without breaking that story.

## Commands

Node 20 or newer. Chrome, a webcam, and a microphone for a live demo.

```bash
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY
npm run dev            # http://localhost:5173, port is fixed
npm test
npm run build          # tsc --noEmit && vite build
npm run copy-models    # refresh face-api weights in public/models
```

`npm test` runs `node --test` on `server/notes.test.mjs`, `shared/distance.test.mjs`, and `shared/memorySearch.test.mjs`. Add a test next to the module when you change parsing, distance, or memory search.

## Layout

| Path | Role |
| --- | --- |
| `src/session/useRecallAI.ts` | Session: camera, mic, matching, notes, views |
| `src/views/` | Screens. Keep them presentational. |
| `src/db/book.ts` | IndexedDB database `recallai`, store `people` |
| `src/listen/speech.ts` | Chrome Web Speech API |
| `src/listen/extract.ts` | Client for `POST /api/extract` |
| `src/listen/ask.ts` | Client for `POST /api/ask` |
| `src/vision/faceTracker.ts` | MediaPipe box, off the main thread |
| `src/vision/recognizeWorker.ts` | face-api descriptors, off the main thread |
| `src/vision/thresholds.ts` | `MATCH_DISTANCE`, `MAYBE_DISTANCE`, `STABLE_MS` |
| `src/vision/placeLabel.ts` | Name label that follows the face |
| `shared/distance.mjs` | Euclidean distance and best match |
| `shared/memorySearch.mjs` | Keyword search over saved memories |
| `server/prompt.mjs` | Instruction for turning a transcript into notes |
| `server/notes.mjs` | Parse model JSON and merge it onto a card |
| `server/extract.mjs` | `POST /api/extract` |
| `server/ask.mjs` | `POST /api/ask` |
| `vite.config.ts` | Dev and preview middleware for those two routes |

`src/` is TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`). `server/` and `shared/` are plain ESM. When you change an exported `.mjs` function, update the matching `.d.mts` so the client still typechecks. `tsconfig.json` includes only `src`.

The Vite server loads `.env` and calls Anthropic. The browser must never receive `ANTHROPIC_API_KEY`. Do not commit `.env`.

## Behavior that must stay true

- Use only what was said. Leave a name, relationship, fact, or reminder empty when the transcript did not say it. `server/prompt.mjs` and `server/notes.mjs` enforce that. Do not “helpfully” fill gaps.
- A new person is created only after the face stays steady for `STABLE_MS` and someone is talking. Walking past the camera does not create a memory.
- `MATCH_DISTANCE` and below is that person. Between the two thresholds, the screen says this might be them. Above `MAYBE_DISTANCE`, the face is someone new. Lower `MATCH_DISTANCE` is stricter.
- If two faces are in frame, use the larger one.
- Memories, including face descriptors, stay in this browser’s IndexedDB. Transcript text is sent to Anthropic. Chrome speech recognition sends audio to Chrome’s speech service. Do not add another network upload of audio, video, or descriptors.
- Model replies are JSON only. Parse them defensively in `server/notes.mjs` and `server/ask.mjs`. A bad reply must not wipe a name already on the card.

## Where to change things

- What is worth remembering: `server/prompt.mjs`.
- How model text becomes a card: `server/notes.mjs`, with a case in `server/notes.test.mjs`.
- Who counts as the same person: `src/vision/thresholds.ts` and `shared/distance.mjs`.
- Spoken questions about saved notes: `server/ask.mjs` and `shared/memorySearch.mjs`.
- What the household sees: `src/views/` and `src/styles.css`. Session wiring stays in `useRecallAI`.

Person records are `Person` in `src/types.ts`: `name`, `relationship`, `facts`, `reminders`, `excerpts`, and `descriptors`. New fields need a safe default in `src/db/book.ts` so older IndexedDB rows still load.

## Checks before you finish

Run `npm test` and `npm run build`.

For UI, layout, or session changes, open `http://localhost:5173` in Chrome and walk the affected path: Start, a visit, Memories, a spoken question, Pause, and delete. Camera and microphone errors should stay visible. Empty states still matter: no key in `.env`, no face yet, and no saved facts.

Do not commit model binaries you did not mean to change, and do not commit secrets.
