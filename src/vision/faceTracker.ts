import { FaceDetector, FilesetResolver, type Detection } from "@mediapipe/tasks-vision";
import type { NormBox } from "./match";

// MediaPipe calls importScripts for its wasm file. That throws in a module worker.
(self as typeof self & { importScripts: (url: string) => void }).importScripts = (url: string) => {
  const request = new XMLHttpRequest();
  request.open("GET", url, false);
  request.send();
  if (request.status && request.status !== 200) throw new Error(`Could not load ${url}`);
  (0, eval)(request.responseText);
};

type Inbound =
  | { type: "init"; wasmUrl: string; modelUrl: string; frames?: ReadableStream<VideoFrame> }
  | { type: "frame"; bitmap: ImageBitmap; id: number; sentAt: number }
  | { type: "sample" }
  | { type: "stop" };

type Outbound =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "box"; id: number; sentAt: number; box: NormBox | null; dropped: boolean; sample?: ImageBitmap };

const DETECT_GAP_MS = 100;

let detector: FaceDetector | null = null;
let busy = false;
let lastTimestamp = 0;
let lastDetectAt = 0;
let frameId = 0;
let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let stopped = false;
let wantSample = false;

self.onmessage = (event: MessageEvent<Inbound>) => {
  const data = event.data;
  if (data.type === "init") {
    if (data.frames) {
      reader = data.frames.getReader();
      void pump();
    }
    void start(data.wasmUrl, data.modelUrl);
    return;
  }
  if (data.type === "sample") {
    wantSample = true;
    return;
  }
  if (data.type === "stop") {
    stopped = true;
    void reader?.cancel().catch(() => {});
    detector?.close();
    detector = null;
    return;
  }
  onBitmap(data.bitmap, data.id, data.sentAt);
};

async function start(wasmUrl: string, modelUrl: string) {
  try {
    const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
    detector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
    post({ type: "ready" });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "Face detection did not start.",
    });
  }
}

async function pump() {
  if (!reader) return;
  while (!stopped) {
    let next: ReadableStreamReadResult<VideoFrame>;
    try {
      next = await reader.read();
    } catch {
      break;
    }
    if (next.done || !next.value) break;
    const frame = next.value;
    const now = performance.now();
    if (!detector || busy || now - lastDetectAt < DETECT_GAP_MS) {
      frame.close();
      continue;
    }
    lastDetectAt = now;
    const sentAt = Date.now();
    busy = true;
    const id = ++frameId;
    let box: NormBox | null = null;
    let sample: ImageBitmap | null = null;
    try {
      const painted = paint(frame);
      const timestamp = Math.max(Math.round(frame.timestamp / 1000), lastTimestamp + 1);
      lastTimestamp = timestamp;
      const result = detector.detectForVideo(painted, timestamp);
      box = largestBox(result.detections, painted.width, painted.height);
      if (wantSample && box) {
        sample = painted.transferToImageBitmap();
        wantSample = false;
      }
    } catch {
      box = null;
    } finally {
      frame.close();
      busy = false;
    }
    if (sample) post({ type: "box", id, sentAt, box, dropped: false, sample }, [sample]);
    else post({ type: "box", id, sentAt, box, dropped: false });
  }
}

function onBitmap(bitmap: ImageBitmap, id: number, sentAt: number) {
  if (!detector || busy) {
    bitmap.close();
    post({ type: "box", id, sentAt, box: null, dropped: true });
    return;
  }
  busy = true;
  let box: NormBox | null = null;
  let sample: ImageBitmap | null = null;
  try {
    const painted = paint(bitmap);
    const timestamp = Math.max(sentAt, lastTimestamp + 1);
    lastTimestamp = timestamp;
    const result = detector.detectForVideo(painted, timestamp);
    box = largestBox(result.detections, painted.width, painted.height);
    if (wantSample && box) {
      sample = painted.transferToImageBitmap();
      wantSample = false;
    }
  } catch {
    box = null;
  } finally {
    bitmap.close();
    busy = false;
  }
  if (sample) post({ type: "box", id, sentAt, box, dropped: false, sample }, [sample]);
  else post({ type: "box", id, sentAt, box, dropped: false });
}

function sourceSize(source: VideoFrame | ImageBitmap): { width: number; height: number } {
  if ("displayWidth" in source) return { width: source.displayWidth, height: source.displayHeight };
  return { width: source.width, height: source.height };
}

function paint(source: VideoFrame | ImageBitmap): OffscreenCanvas {
  const width = 320;
  const size = sourceSize(source);
  const height = Math.max(1, Math.round((size.height / Math.max(size.width, 1)) * width));
  if (!canvas || !context) {
    canvas = new OffscreenCanvas(width, height);
    context = canvas.getContext("2d", { alpha: false });
  }
  if (!canvas || !context) throw new Error("Could not draw the camera frame.");
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function largestBox(detections: Detection[], width: number, height: number): NormBox | null {
  let best: NormBox | null = null;
  let bestArea = 0;
  for (const detection of detections) {
    const box = detection.boundingBox;
    if (!box || width === 0 || height === 0) continue;
    const normalized = {
      x: box.originX / width,
      y: box.originY / height,
      width: box.width / width,
      height: box.height / height,
    };
    const area = normalized.width * normalized.height;
    if (![normalized.x, normalized.y, normalized.width, normalized.height].every(Number.isFinite)) continue;
    if (area <= bestArea || normalized.width <= 0.02 || normalized.height <= 0.02) continue;
    best = normalized;
    bestArea = area;
  }
  return best;
}

function post(message: Outbound, transfer?: Transferable[]) {
  self.postMessage(message, { transfer: transfer ?? [] });
}
