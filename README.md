# Recall AI

Recall AI is a laptop web app for a household supporting someone with dementia. The camera looks at a visitor. The microphone listens. Claude reads the transcript and fills in a name, a relationship, and a few facts from what was actually said. Nobody creates a profile first.

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

## How a face becomes a memory

I match faces in the browser with [face-api](https://github.com/vladmandic/face-api) (MIT). A face becomes a list of numbers, a descriptor. I compare that list to the ones already in IndexedDB. The comparison is Euclidean distance. Smaller means the faces are more alike.

The cutoffs are in [`src/vision/thresholds.ts`](src/vision/thresholds.ts):

- `MATCH_DISTANCE` — at or below this, I use that person's name.
- `MAYBE_DISTANCE` — between the two numbers, the screen says this might be them.
- Above `MAYBE_DISTANCE`, I treat the face as someone new.

I only open a new memory if the face stays still for about a second and a half and someone is talking. Walking past the camera does not create a person. If two faces are in the picture, I use the bigger one.

If the app mixes two people up, I lower `MATCH_DISTANCE`. Lower is stricter.

## How a conversation becomes notes

Chrome turns the microphone into text. In Chrome, that audio goes to Chrome's speech service. I do not save the audio.

After a pause, the new text goes to `POST /api/extract`. The server asks Claude (`claude-haiku-5-5` unless `ANTHROPIC_MODEL` is set) with the instruction in [`server/prompt.mjs`](server/prompt.mjs). That is the file I change when I want it to remember something different. If the conversation did not say it, the field stays empty.

The name, relationship, facts, a short bit of the transcript, and the face descriptors stay in IndexedDB on this computer. Delete everything clears that database. The camera and microphone buttons turn those off.

## Libraries

- React and Vite for the interface
- `@vladmandic/face-api` for on-device face detection and descriptors
- Chrome Web Speech API for the transcript
- Anthropic Messages API for memory notes
- IndexedDB for the memory book

## Privacy

Memories, including face descriptors, stay in this browser’s IndexedDB. The transcript text goes to Anthropic so Claude can pull out notes. Chrome’s speech recognition also sends the microphone audio to its own speech service. I say that when I demo the app.

## Checks

```bash
npm test
npm run build
```
