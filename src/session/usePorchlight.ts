import { useEffect, useRef, useState, type RefObject } from "react";
import { deleteAllPeople, deletePerson, loadPeople, savePerson } from "../db/book";
import { extractNotes } from "../listen/extract";
import { startListening } from "../listen/speech";
import type { Person } from "../types";
import { openDetectorStream } from "../vision/capture";
import type { DetectedFace, NormBox } from "../vision/match";
import { clearFace, createLabelMotion, noteFace, stepLabel } from "../vision/placeLabel";
import { MAYBE_DISTANCE, MATCH_DISTANCE, STABLE_MS } from "../vision/thresholds";
import { bestMatch, euclidean } from "../../shared/distance.mjs";
import { mergeCard } from "../../server/notes.mjs";

type Phase = "welcome" | "running" | "paused";
type View = "visit" | "memories";

export type VisitPerf = PorchlightPerf;

const DETECT_GAP_MS = 90;
const LABEL_HOLD_MS = 1200;
const CARD_HOLD_MS = 4000;

function blankPerson(descriptor: Float32Array): Person {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: null,
    relationship: null,
    facts: [],
    reminders: [],
    excerpts: [],
    descriptors: [Array.from(descriptor)],
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

export function usePorchlight(
  videoRef: RefObject<HTMLVideoElement | null>,
  labelRef: RefObject<HTMLElement | null>,
) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [yieldMic, setYieldMic] = useState(false);
  const [view, setView] = useState<View>("visit");
  const [people, setPeople] = useState<Person[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [hearing, setHearing] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [perf, setPerf] = useState<VisitPerf | null>(null);

  const peopleRef = useRef<Person[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const pendingRef = useRef("");
  const lastSpeechAtRef = useRef(0);
  const lastExtractAtRef = useRef(0);
  const lastFaceAtRef = useRef(0);
  const extractingRef = useRef(false);
  const hearingRef = useRef("");
  const timingRef = useRef({
    cameraReadyMs: null as number | null,
    modelMs: null as number | null,
    peopleMs: null as number | null,
    heardMs: null as number | null,
    shownMs: null as number | null,
    finalMs: null as number | null,
    extractMs: null as number | null,
  });
  const stableRef = useRef<{ descriptor: Float32Array; since: number } | null>(null);
  const uncertainRef = useRef(false);
  const recognizeWorkerRef = useRef<Worker | null>(null);
  const recognizingRef = useRef(false);
  const matchMsRef = useRef<number | null>(null);
  const entranceAtRef = useRef(0);
  const reportedMatchRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const viewRef = useRef(view);
  viewRef.current = view;
  const handleFaceRef = useRef<(face: DetectedFace | null) => void>(() => {});
  const flushRef = useRef<() => Promise<void>>(async () => {});

  function showSpeech(text: string) {
    if (hearingRef.current === text) return;
    hearingRef.current = text;
    setHearing(text);
  }

  useEffect(() => {
    let cancel = false;
    const peopleStarted = performance.now();
    const recognizeWorker = new Worker(new URL("../vision/recognizeWorker.ts", import.meta.url), { type: "module" });
    recognizeWorkerRef.current = recognizeWorker;
    recognizeWorker.onerror = (event) => {
      (window as Window & { __faceDebug?: string }).__faceDebug = event.message;
      if (!cancel) setStatus("Face matching did not load. The camera is still on, but people will not be recognized.");
    };
    recognizeWorker.onmessage = (event: MessageEvent<{ type: string; elapsed?: number; message?: string; descriptor?: Float32Array | null }>) => {
      const data = event.data;
      if (data.type === "ready") {
        if (!cancel) timingRef.current.modelMs = data.elapsed ?? null;
        return;
      }
      if (data.type === "error") {
        (window as Window & { __faceDebug?: string }).__faceDebug = data.message;
        if (!cancel) setStatus("Face matching did not load. The camera is still on, but people will not be recognized.");
        return;
      }
      if (data.type !== "descriptor") return;
      recognizingRef.current = false;
      if (cancel || phaseRef.current !== "running" || !data.descriptor) return;
      handleFaceRef.current({ descriptor: data.descriptor, area: 1 });
      if (activeIdRef.current && !uncertainRef.current && entranceAtRef.current && !reportedMatchRef.current) {
        matchMsRef.current = Math.round(performance.now() - entranceAtRef.current);
        reportedMatchRef.current = true;
      }
    };
    recognizeWorker.postMessage({ type: "init", modelUrl: `${location.origin}/models` });
    loadPeople()
      .then((rows) => {
        if (cancel) return;
        timingRef.current.peopleMs = Math.round(performance.now() - peopleStarted);
        peopleRef.current = rows;
        setPeople(rows);
      })
      .catch(() => {
        if (!cancel) setStatus("This browser could not open the memory book on this computer.");
      });
    fetch("/api/extract")
      .then((response) => response.json())
      .then((body: { ready?: boolean }) => {
        if (!cancel) setKeyMissing(!body.ready);
      })
      .catch(() => {
        if (!cancel) setKeyMissing(true);
      });
    return () => {
      cancel = true;
      recognizeWorker.terminate();
      recognizeWorkerRef.current = null;
    };
  }, []);

  function showPerson(id: string | null, nextUncertain: boolean) {
    if (activeIdRef.current !== id) {
      activeIdRef.current = id;
      setActiveId(id);
    }
    if (uncertainRef.current !== nextUncertain) {
      uncertainRef.current = nextUncertain;
      setUncertain(nextUncertain);
    }
  }

  function commitPerson(person: Person) {
    const next = peopleRef.current.some((item) => item.id === person.id)
      ? peopleRef.current.map((item) => (item.id === person.id ? person : item))
      : [person, ...peopleRef.current];
    peopleRef.current = next;
    setPeople(next);
    void savePerson(person);
  }

  handleFaceRef.current = (face) => {
    if (!face) {
      if (activeIdRef.current && Date.now() - lastFaceAtRef.current > 4000) {
        showPerson(null, false);
      }
      return;
    }

    lastFaceAtRef.current = Date.now();
    const match = bestMatch(face.descriptor, peopleRef.current);
    if (match && match.distance <= MAYBE_DISTANCE) {
      const confident = match.distance <= MATCH_DISTANCE;
      showPerson(match.id, !confident);
      stableRef.current = null;
      if (!confident) return;
      const person = peopleRef.current.find((item) => item.id === match.id);
      if (!person) return;
      const now = Date.now();
      const nearest = Math.min(
        ...person.descriptors.map((saved) => euclidean(saved, face.descriptor)),
      );
      const descriptors =
        person.descriptors.length < 5 && nearest > 0.18
          ? [...person.descriptors, Array.from(face.descriptor)]
          : person.descriptors;
      if (descriptors === person.descriptors && now - person.lastSeenAt < 5000) return;
      commitPerson({
        ...person,
        descriptors,
        lastSeenAt: now,
        updatedAt: descriptors === person.descriptors ? person.updatedAt : now,
      });
      return;
    }

    const stable = stableRef.current;
    if (!stable || euclidean(stable.descriptor, face.descriptor) > 0.35) {
      stableRef.current = { descriptor: face.descriptor, since: Date.now() };
      return;
    }
    const spoke =
      pendingRef.current.trim().length > 8 || Date.now() - lastSpeechAtRef.current < 8000;
    if (Date.now() - stable.since < STABLE_MS || !spoke) return;

    const person = blankPerson(face.descriptor);
    showPerson(person.id, false);
    stableRef.current = null;
    commitPerson(person);
  };

  flushRef.current = async () => {
    if (extractingRef.current) return;
    const personId = activeIdRef.current;
    const pending = pendingRef.current.trim();
    if (!personId || pending.length < 12) return;
    const quietFor = Date.now() - lastSpeechAtRef.current;
    const sinceExtract = Date.now() - lastExtractAtRef.current;
    const thoughtEnded = quietFor > 1800;
    const longEnough = pending.length >= 180;
    if (!thoughtEnded && !longEnough) return;
    if (sinceExtract < 4000) return;

    const person = peopleRef.current.find((item) => item.id === personId);
    if (!person) return;
    extractingRef.current = true;
    const snapshot = pending;
    pendingRef.current = "";
    const extractStarted = performance.now();
    try {
      const result = await extractNotes({
        transcript: snapshot,
        current: {
          name: person.name,
          relationship: person.relationship,
          facts: person.facts.map((fact) => fact.text),
          reminders: (person.reminders ?? []).map((item) => item.text),
        },
      });
      if ("error" in result) {
        pendingRef.current = `${snapshot} ${pendingRef.current}`.trim();
        if (result.error === "missing_key") {
          setKeyMissing(true);
          setExtractError(null);
        } else {
          setExtractError(result.detail || "Claude could not read that part of the conversation.");
        }
        return;
      }
      const latest = peopleRef.current.find((item) => item.id === personId) ?? person;
      const merged = mergeCard(
        {
          name: latest.name,
          relationship: latest.relationship,
          facts: latest.facts.map((fact) => fact.text),
          reminders: (latest.reminders ?? []).map((item) => item.text),
        },
        result,
      );
      const now = Date.now();
      const facts = merged.facts.map((text: string) => {
        const found = latest.facts.find((fact) => fact.text.toLowerCase() === text.toLowerCase());
        return found ?? { id: crypto.randomUUID(), text, at: now };
      });
      const kept = latest.reminders ?? [];
      const seen = new Set(kept.map((item) => item.text.toLowerCase()));
      const reminders = [
        ...kept,
        ...result.reminders
          .filter((text) => !seen.has(text.toLowerCase()))
          .map((text) => ({ id: crypto.randomUUID(), text, at: now, done: false })),
      ].slice(-12);
      commitPerson({
        ...latest,
        name: merged.name,
        relationship: merged.relationship,
        facts,
        reminders,
        excerpts: [...latest.excerpts, { text: snapshot.slice(0, 280), at: now }].slice(-8),
        updatedAt: now,
        lastSeenAt: now,
      });
      setKeyMissing(false);
      setExtractError(null);
      lastExtractAtRef.current = now;
      timingRef.current.extractMs = Math.round(performance.now() - extractStarted);
    } catch {
      pendingRef.current = `${snapshot} ${pendingRef.current}`.trim();
      setExtractError("Claude could not be reached.");
    } finally {
      extractingRef.current = false;
    }
  };

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      void flushRef.current();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running" || !micOn || yieldMic) return;
    let speechStartedAt = 0;
    let heardThisUtterance = false;
    let speechEndedAt = 0;
    let stopped = false;
    let listener: { stop: () => void } | null = null;
    const timer = window.setTimeout(() => {
      if (stopped) return;
      listener = startListening({
        onSpeechStart: () => {
          speechStartedAt = performance.now();
          heardThisUtterance = false;
          speechEndedAt = 0;
        },
        onSpeechEnd: () => {
          speechEndedAt = performance.now();
        },
        onInterim: (text) => {
          const arrived = performance.now();
          if (!heardThisUtterance && speechStartedAt) {
            heardThisUtterance = true;
            timingRef.current.heardMs = Math.round(arrived - speechStartedAt);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                timingRef.current.shownMs = Math.round(performance.now() - arrived);
              });
            });
          }
          showSpeech(text);
        },
        onFinal: (text) => {
          pendingRef.current = `${pendingRef.current} ${text}`.trim();
          lastSpeechAtRef.current = Date.now();
          if (speechEndedAt) timingRef.current.finalMs = Math.round(performance.now() - speechEndedAt);
          showSpeech(text);
        },
        onError: (message) => setSpeechError(message),
      });
      if (stopped) {
        listener?.stop();
        return;
      }
      if (!listener) {
        setSpeechError("This browser cannot listen. Open Porchlight in Chrome.");
        return;
      }
      setSpeechError(null);
    }, 160);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      listener?.stop();
    };
  }, [phase, micOn, yieldMic]);

  useEffect(() => {
    if (phase !== "running" || !cameraOn) return;
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;
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
    let detectStop = () => {};
    let hidden: HTMLVideoElement | null = null;
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

    const paint = (now: number) => {
      if (stopped) return;
      paintFrame = window.requestAnimationFrame(paint);
      const label = labelRef.current;
      if (!label || document.hidden || viewRef.current !== "visit") {
        hideLabel();
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
        const gap = uncertainRef.current ? 1200 : 900;
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
        showPerson(null, false);
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
      const snapshot: VisitPerf = {
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
      window.__porchlightPerf = snapshot;
      if (new URLSearchParams(window.location.search).has("perf")) setPerf(snapshot);
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
            facingMode: "user",
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 },
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
          if (!stopped) setStatus("Face detection did not start. The camera is still on.");
        };
        worker.onmessage = (event: MessageEvent<{ type: string; id?: number; sentAt?: number; box?: NormBox | null; message?: string; dropped?: boolean; sample?: ImageBitmap }>) => {
          const data = event.data;
          if (data.type === "ready") {
            if (!stopped) setStatus(null);
            return;
          }
          if (data.type === "error") {
            (window as Window & { __faceDebug?: string }).__faceDebug = data.message;
            if (!stopped) setStatus("Face detection did not start. The camera is still on.");
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
        const opened = track ? openDetectorStream(track) : null;
        if (opened) {
          detectStop = opened.stop;
          worker.postMessage(
            {
              type: "init",
              frames: opened.frames,
              wasmUrl: `${location.origin}/mediapipe`,
              modelUrl: `${location.origin}/models/blaze_face_short_range.tflite`,
            },
            [opened.frames],
          );
        } else {
          worker.postMessage({
            type: "init",
            wasmUrl: `${location.origin}/mediapipe`,
            modelUrl: `${location.origin}/models/blaze_face_short_range.tflite`,
          });
          if (track) {
            const clone = track.clone();
            detectStop = () => clone.stop();
            hidden = document.createElement("video");
            hidden.muted = true;
            hidden.playsInline = true;
            hidden.srcObject = new MediaStream([clone]);
            await hidden.play().catch(() => {});
            sampleTimer = window.setInterval(() => {
              if (stopped || !worker || !hidden || hidden.readyState < 2 || hidden.videoWidth === 0 || inflight) {
                if (inflight) stats.skipped += 1;
                return;
              }
              const width = 320;
              const height = Math.max(1, Math.round((hidden.videoHeight / hidden.videoWidth) * width));
              inflight = true;
              const id = ++frameId;
              const sentAt = Date.now();
              createImageBitmap(hidden, { resizeWidth: width, resizeHeight: height, resizeQuality: "low" })
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
            }, DETECT_GAP_MS);
          }
        }
        setReady(true);
        setStatus(null);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setReady(false);
        setStatus(
          name === "NotAllowedError"
            ? "The camera is blocked. Allow it in the browser, then turn the camera on."
            : "The camera did not start. Check that it is plugged in, then turn the camera on.",
        );
        setPhase("paused");
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
      detectStop();
      if (hidden) {
        hidden.pause();
        hidden.srcObject = null;
      }
      worker?.postMessage({ type: "stop" });
      worker?.terminate();
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setReady(false);
      setPerf(null);
    };
  }, [phase, cameraOn, videoRef, labelRef]);

  const active = people.find((person) => person.id === activeId) ?? null;

  return {
    phase,
    cameraOn,
    micOn,
    view,
    people,
    active,
    uncertain,
    hearing,
    status,
    speechError,
    extractError,
    keyMissing,
    ready,
    confirmingDelete,
    perf,
    start: () => {
      setStatus(null);
      setPhase("running");
      setView("visit");
    },
    toggleCamera: () => {
      setStatus(null);
      setCameraOn((on) => !on);
      if (phase === "paused") setPhase("running");
    },
    toggleMic: () => setMicOn((on) => !on),
    holdListening: (held: boolean) => setYieldMic(held),
    reportSpeechError: (message: string | null) => setSpeechError(message),
    showVisit: () => setView("visit"),
    showMemories: () => setView("memories"),
    addNote: (personId: string, text: string) => {
      const person = peopleRef.current.find((item) => item.id === personId);
      const note = text.replace(/\s+/g, " ").trim().slice(0, 140);
      if (!person || note.length === 0) return;
      const key = note.toLowerCase();
      if (person.facts.some((fact) => fact.text.toLowerCase() === key)) return;
      const now = Date.now();
      commitPerson({
        ...person,
        facts: [...person.facts, { id: crypto.randomUUID(), text: note, at: now }],
        updatedAt: now,
      });
    },
    removeNote: (personId: string, text: string) => {
      const person = peopleRef.current.find((item) => item.id === personId);
      if (!person) return;
      const key = text.replace(/\s+/g, " ").trim().toLowerCase();
      commitPerson({
        ...person,
        facts: person.facts.filter((fact) => fact.text.toLowerCase() !== key),
        reminders: (person.reminders ?? []).filter((item) => item.text.toLowerCase() !== key),
        updatedAt: Date.now(),
      });
    },
    finishReminder: (personId: string, reminderId: string) => {
      const person = peopleRef.current.find((item) => item.id === personId);
      if (!person) return;
      commitPerson({
        ...person,
        reminders: (person.reminders ?? []).map((item) =>
          item.id === reminderId ? { ...item, done: true } : item,
        ),
        updatedAt: Date.now(),
      });
    },
    rename: (id: string, name: string) => {
      const person = peopleRef.current.find((item) => item.id === id);
      if (!person) return;
      const nextName = name.replace(/\s+/g, " ").trim().slice(0, 40) || null;
      commitPerson({ ...person, name: nextName, updatedAt: Date.now() });
    },
    remove: (id: string) => {
      peopleRef.current = peopleRef.current.filter((person) => person.id !== id);
      setPeople(peopleRef.current);
      if (activeIdRef.current === id) showPerson(null, false);
      void deletePerson(id);
    },
    askDeleteAll: () => setConfirmingDelete(true),
    cancelDeleteAll: () => setConfirmingDelete(false),
    removeAll: () => {
      peopleRef.current = [];
      pendingRef.current = "";
      setPeople([]);
      showPerson(null, false);
      setConfirmingDelete(false);
      void deleteAllPeople();
    },
  };
}
