# Porchlight

Porchlight is a laptop web app for a household supporting someone with dementia. The camera looks at a visitor. The microphone listens. Claude reads the transcript and fills in a name, a relationship, and a few facts from what was actually said. Nobody creates a profile first.

The next time that same face sits down, the card is already there.

## Run it

You need Node 20 or newer, Chrome, a webcam, and a microphone.

```bash
npm install
cp .env.example .env
```

Put your API key in `.env` (Project is set to use an Anthropic API Key):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then start the app and open [http://localhost:5173](http://localhost:5173) in Chrome.

```bash
npm run dev
```

Press **Start**. Sit in front of the laptop and say something like: “Hi, I’m Mateo, I’m your grandson, and I have a dog named Pepper.” The card fills in after a short pause in speech. Pause, then sit down again without saying the name. Mateo’s card should come back.

The key stays in `.env`, which git ignores. A local route on the dev server calls Claude. The browser never receives the key.

## How a face becomes a memory

Face matching runs in the browser with [face-api](https://github.com/vladmandic/face-api) (MIT). A detected face becomes a list of numbers called a descriptor. Porchlight compares that list with descriptors already saved in IndexedDB. The comparison is Euclidean distance: smaller means more alike.

Two numbers in [`src/vision/thresholds.ts`](src/vision/thresholds.ts) decide what happens:

- `MATCH_DISTANCE` — at or below this, the screen uses that person’s name.
- `MAYBE_DISTANCE` — between the two numbers, the screen says “This might be.”
- Above `MAYBE_DISTANCE`, the face is treated as someone new.

A new memory opens only when a face stays steady for about a second and a half and someone is talking. Walking past the camera without speaking does not create a person. If two faces are in frame, the larger one is used.

Change `MATCH_DISTANCE` if the app mixes two people up, or fails to recognize someone it has already met. Lower is stricter.

## How a conversation becomes notes

Chrome’s speech recognition turns the microphone into text. In Chrome, that audio is sent to Chrome’s speech service. Porchlight does not save the audio.

After a pause in speech, the new text goes to `POST /api/extract`. The server calls Claude Haiku (`claude-haiku-5-5` unless `ANTHROPIC_MODEL` is set) with the instruction in [`server/prompt.mjs`](server/prompt.mjs). That file is the place to change what counts as worth remembering. Claude is told to leave a field empty when the conversation did not say it.

The name, relationship, facts, a short transcript excerpt, and the face descriptors are stored in IndexedDB on this computer. **Delete everything on this computer** clears that database. **Pause** turns the camera and microphone off.

## Libraries

- React and Vite for the interface
- `@vladmandic/face-api` for on-device face detection and descriptors
- Chrome Web Speech API for the transcript
- Anthropic Messages API for memory notes
- IndexedDB for the memory book

## Privacy

Memories, including face descriptors, stay in this browser’s IndexedDB. The transcript text is sent to Anthropic so Claude can extract notes. Chrome’s speech recognition sends microphone audio to its own speech service. Say that plainly if you demo the app.

## Checks

```bash
npm test
npm run build
```
