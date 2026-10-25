import type { RefObject } from "react";
import type { NormBox } from "../vision/match";
import { clearFace, createLabelMotion, noteFace, stepLabel } from "../vision/placeLabel";

const DETECT_GAP_MS = 400;
const LABEL_HOLD_MS = 1200;
const CARD_HOLD_MS = 4000;

export type VisitTiming = {
  cameraReadyMs: number | null;
  modelMs: number | null;
  peopleMs: number | null;
  heardMs: number | null;
  shownMs: number | null;
  finalMs: number | null;
  extractMs: number | null;
};

export function startVisitCamera(input: {
  video: HTMLVideoElement;
  labelRef: RefObject<HTMLElement | null>;
  viewRef: RefObject<string>;
  recognizeWorkerRef: RefObject<Worker | null>;
  recognizingRef: RefObject<boolean>;
  activeIdRef: RefObject<string | null>;
  uncertainRef: RefObject<boolean>;
  entranceAtRef: RefObject<number>;
  reportedMatchRef: RefObject<boolean>;
  matchMsRef: RefObject<number | null>;
  timingRef: RefObject<VisitTiming>;
  setStatus: (status: string | null) => void;
  setReady: (ready: boolean) => void;
  setPhase: (phase: "paused") => void;
  setPerf: (perf: RecallAIPerf | null) => void;
  showPerson: (id: string | null, uncertain: boolean) => void;
}): () => void {
  const {
    video,
    labelRef,
    viewRef,
    recognizeWorkerRef,
    recognizingRef,
    activeIdRef,
    uncertainRef,
    entranceAtRef,
    reportedMatchRef,
    matchMsRef,
    timingRef,
  } = input;

  let stopped = false;
  let notesShiftX = 0;
  let notesShiftY = 0;
  let nameShiftX = 0;
  let nameShiftY = 0;
  let publishTimer = 0;
  let paintFrame = 0;
  let videoFrameId = 0;
  let fallbackFrame = 0;
  let stream: MediaStream | null = null;
  let worker: Worker | null = null;
  let inflight = false;
  let lastBoxAt = 0;
  let lastRecognizeAt = 0;
  let frameId = 0;
  let sampleAsked = false;
  let sampleTimer = 0;
  const motion = createLabelMotion();
  const stats = {
    preview: 0,
    detects: 0,
    skipped: 0,
    latencies: [] as number[],
    longCount: 0,
    longMs: 0,
  };

  const hideLabel = () => {
    const label = labelRef.current;
    if (!label) return;
    label.style.opacity = "0";
  };

  let glassesOn = false;
  let glassesChecked = 0;
  let notesSlot: HTMLElement | null = null;
  let nameSlot: HTMLElement | null = null;

  const paint = (now: number) => {
    if (stopped) return;
    paintFrame = window.requestAnimationFrame(paint);
    const label = labelRef.current;
    if (!label || document.hidden || viewRef.current !== "visit") {
      hideLabel();
      return;
    }
    if (now - glassesChecked > 500) {
      glassesChecked = now;
      glassesOn = Boolean(document.querySelector(".app.glasses"));
      const slots = glassesOn ? document.querySelectorAll(".glasses-slot") : [];
      notesSlot = (slots[0] as HTMLElement | undefined) ?? null;
      nameSlot = (slots[1] as HTMLElement | undefined) ?? null;
    }
    if (glassesOn) {
      label.style.opacity = "1";
      label.style.transform = "";
      const faceX = motion.x?.hat ?? 0.5;
      const faceY = motion.y?.hat ?? 0.35;
      const settle = 0.08;
      notesShiftX += (Math.max(-42, Math.min(42, (0.35 - faceX) * 90)) - notesShiftX) * settle;
      notesShiftY += (Math.max(-28, Math.min(72, (faceY - 0.28) * 120)) - notesShiftY) * settle;
      nameShiftX += (Math.max(-42, Math.min(42, (faceX - 0.65) * 90)) - nameShiftX) * settle;
      nameShiftY += (Math.max(-28, Math.min(72, (faceY - 0.28) * 120)) - nameShiftY) * settle;
      if (notesSlot) notesSlot.style.transform = `translate3d(${Math.round(notesShiftX)}px, ${Math.round(notesShiftY)}px, 0)`;
      if (nameSlot) nameSlot.style.transform = `translate3d(${Math.round(nameShiftX)}px, ${Math.round(nameShiftY)}px, 0)`;
      return;
    }
    stepLabel(video, label, motion, now);
  };

  const applyBox = (box: NormBox | null, sentAt: number) => {
    if (box) {
      lastBoxAt = Date.now();
      if (!entranceAtRef.current) entranceAtRef.current = performance.now();
      noteFace(motion, box, sentAt);
      const confident = Boolean(activeIdRef.current && !uncertainRef.current);
      const gap = uncertainRef.current ? 2500 : 1800;
      if (!confident && !recognizingRef.current && !sampleAsked && performance.now() - lastRecognizeAt >= gap) {
        sampleAsked = true;
        worker?.postMessage({ type: "sample" });
      }
      return;
    }
    if (lastBoxAt !== 0 && Date.now() - lastBoxAt > LABEL_HOLD_MS) {
      clearFace(motion);
      entranceAtRef.current = 0;
      reportedMatchRef.current = false;
    }
    if (lastBoxAt !== 0 && Date.now() - lastBoxAt > CARD_HOLD_MS) {
      input.showPerson(null, false);
    }
  };

  const forwardSample = (bitmap: ImageBitmap) => {
    sampleAsked = false;
    const recognize = recognizeWorkerRef.current;
    const confident = Boolean(activeIdRef.current && !uncertainRef.current);
    if (!recognize || recognizingRef.current || confident || document.hidden || viewRef.current !== "visit") {
      bitmap.close();
      return;
    }
    recognizingRef.current = true;
    lastRecognizeAt = performance.now();
    recognize.postMessage({ type: "frame", bitmap }, [bitmap]);
  };

  const markCameraReady = () => {
    if (timingRef.current.cameraReadyMs !== null) return;
    timingRef.current.cameraReadyMs = Math.round(performance.now() - cameraStarted);
  };

  const sendFrame = () => {
    if (stopped || !worker || video.readyState < 2 || video.videoWidth === 0) return;
    if (inflight) {
      stats.skipped += 1;
      return;
    }
    inflight = true;
    const id = ++frameId;
    const sentAt = Date.now();
    const width = 320;
    const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
    createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: "low" })
      .then((bitmap) => {
        if (stopped || !worker) {
          bitmap.close();
          inflight = false;
          return;
        }
        worker.postMessage({ type: "frame", bitmap, id, sentAt }, [bitmap]);
      })
      .catch(() => {
        inflight = false;
      });
  };

  const onVideoFrame = () => {
    if (stopped) return;
    markCameraReady();
    stats.preview += 1;
    videoFrameId = video.requestVideoFrameCallback(onVideoFrame);
  };

  const publish = () => {
    const samples = stats.latencies;
    const avg = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
    const snapshot: RecallAIPerf = {
      previewFps: stats.preview,
      detectFps: stats.detects,
      detectMsAvg: Math.round(avg),
      detectMsP95: Math.round(p95),
      skipped: stats.skipped,
      inflight: inflight ? 1 : 0,
      matchMs: matchMsRef.current,
      cameraReadyMs: timingRef.current.cameraReadyMs,
      modelMs: timingRef.current.modelMs,
      peopleMs: timingRef.current.peopleMs,
      heardMs: timingRef.current.heardMs,
      shownMs: timingRef.current.shownMs,
      finalMs: timingRef.current.finalMs,
      extractMs: timingRef.current.extractMs,
      longTaskCount: stats.longCount,
      longTaskMs: Math.round(stats.longMs),
    };
    window.__recallAIPerf = snapshot;
    if (new URLSearchParams(window.location.search).has("perf")) input.setPerf(snapshot);
    stats.preview = 0;
    stats.detects = 0;
    stats.skipped = 0;
    stats.longCount = 0;
    stats.longMs = 0;
  };

  const longTasks = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      stats.longCount += 1;
      stats.longMs += entry.duration;
    }
  });
  try {
    longTasks.observe({ entryTypes: ["longtask"] });
  } catch {
    // This browser does not report long tasks.
  }

  publishTimer = window.setInterval(publish, 1000);

  const cameraStarted = performance.now();

  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          // 720p plus a second copy for detection dropped the preview under 30 fps.
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0] ?? null;
      if (track) track.contentHint = "motion";
      video.srcObject = stream;
      await video.play().catch(() => {});
      paintFrame = window.requestAnimationFrame(paint);
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrameId = video.requestVideoFrameCallback(onVideoFrame);
      } else {
        const tick = () => {
          if (stopped) return;
          markCameraReady();
          stats.preview += 1;
          fallbackFrame = window.requestAnimationFrame(tick);
        };
        fallbackFrame = window.requestAnimationFrame(tick);
      }
      worker = new Worker(new URL("../vision/faceTracker.ts", import.meta.url), { type: "module" });
      worker.onerror = (event) => {
        (window as Window & { __faceDebug?: string }).__faceDebug = event.message;
        if (!stopped) input.setStatus("Face detection did not start. The camera is still on.");
      };
      worker.onmessage = (event: MessageEvent<{ type: string; id?: number; sentAt?: number; box?: NormBox | null; message?: string; dropped?: boolean; sample?: ImageBitmap }>) => {
        const data = event.data;
        if (data.type === "ready") {
          if (!stopped) input.setStatus(null);
          return;
        }
        if (data.type === "error") {
          (window as Window & { __faceDebug?: string }).__faceDebug = data.message;
          if (!stopped) input.setStatus("Face detection did not start. The camera is still on.");
          return;
        }
        if (data.type !== "box" || data.id === undefined || data.sentAt === undefined) return;
        inflight = false;
        if (data.sample) forwardSample(data.sample);
        if (data.dropped) return;
        stats.detects += 1;
        stats.latencies.push(Date.now() - data.sentAt);
        if (stats.latencies.length > 40) stats.latencies.shift();
        applyBox(data.box ?? null, data.sentAt);
      };
      worker.postMessage({
        type: "init",
        wasmUrl: `${location.origin}/mediapipe`,
        modelUrl: `${location.origin}/models/blaze_face_short_range.tflite`,
      });
      sampleTimer = window.setInterval(sendFrame, DETECT_GAP_MS);
      input.setReady(true);
      input.setStatus(null);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      input.setReady(false);
      input.setStatus(
        name === "NotAllowedError"
          ? "The camera is blocked. Allow it in the browser, then turn the camera on."
          : "The camera did not start. Check that it is plugged in, then turn the camera on.",
      );
      input.setPhase("paused");
    }
  })();

  return () => {
    stopped = true;
    window.cancelAnimationFrame(paintFrame);
    window.cancelAnimationFrame(fallbackFrame);
    if (videoFrameId) video.cancelVideoFrameCallback(videoFrameId);
    window.clearInterval(publishTimer);
    longTasks.disconnect();
    hideLabel();
    window.clearInterval(sampleTimer);
    worker?.postMessage({ type: "stop" });
    worker?.terminate();
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    input.setReady(false);
    input.setPerf(null);
  };
}
