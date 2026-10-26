import { useEffect, useRef, useState, type RefObject } from "react";
import { deleteAllPeople, deletePerson, loadPeople, savePerson } from "../db/book";
import { extractNotes } from "../listen/extract";
import type { Person } from "../types";
import type { DetectedFace } from "../vision/match";
import { startVisitCamera, type VisitTiming } from "./cameraLoop";
import { updateFromFace } from "./matchFace";
import { glassesCommand, recallUtterance } from "../../shared/glassesVoice.mjs";
import { reminderLine } from "../../server/notes.mjs";
import { applyNotes, shouldExtract } from "./saveTranscript";
import { startListening } from "../listen/speech";

type Phase = "welcome" | "running" | "paused";
type View = "visit" | "memories";

export type VisitPerf = RecallAIPerf;

export function useRecallAI(
  videoRef: RefObject<HTMLVideoElement | null>,
  labelRef: RefObject<HTMLElement | null>,
  spokenRef?: RefObject<((text: string) => boolean) | null>,
) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [yieldMic, setYieldMic] = useState(false);
  const [view, setView] = useState<View>("visit");
  const [people, setPeople] = useState<Person[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [perf, setPerf] = useState<VisitPerf | null>(null);
  const [heard, setHeard] = useState("");

  const peopleRef = useRef<Person[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const pendingRef = useRef("");
  const liveRef = useRef("");
  const phraseEndedRef = useRef(false);
  const lastSpeechAtRef = useRef(0);
  const lastExtractAtRef = useRef(0);
  const lastFaceAtRef = useRef(0);
  const extractingRef = useRef(false);
  const timingRef = useRef<VisitTiming>({
    cameraReadyMs: null as number | null,
    modelMs: null as number | null,
    peopleMs: null as number | null,
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

  useEffect(() => {
    let cancel = false;
    const peopleStarted = performance.now();
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
    };
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    let cancel = false;
    let recognizeWorker: Worker | null = null;
    // TensorFlow and the face models peg a core. Wait until the camera is on screen.
    const timer = window.setTimeout(() => {
      if (cancel) return;
      recognizeWorker = new Worker(new URL("../vision/recognizeWorker.ts", import.meta.url), { type: "module" });
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
    }, 1500);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
      recognizeWorker?.terminate();
      if (recognizeWorkerRef.current === recognizeWorker) recognizeWorkerRef.current = null;
      recognizingRef.current = false;
    };
  }, [phase]);

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
    const result = updateFromFace({
      face,
      people: peopleRef.current,
      activeId: activeIdRef.current,
      lastFaceAt: lastFaceAtRef.current,
      stable: stableRef.current,
      pending: pendingRef.current,
      lastSpeechAt: lastSpeechAtRef.current,
    });
    lastFaceAtRef.current = result.lastFaceAt;
    const action = result.action;
    if (action.type === "clear") {
      showPerson(null, false);
      return;
    }
    if (action.type === "match") {
      showPerson(action.id, action.uncertain);
      stableRef.current = null;
      if (action.saved) commitPerson(action.saved);
      return;
    }
    if (action.type === "hold") {
      stableRef.current = action.stable;
      return;
    }
    if (action.type === "new") {
      showPerson(action.person.id, false);
      stableRef.current = null;
      commitPerson(action.person);
    }
  };

  flushRef.current = async () => {
    if (extractingRef.current) return;
    const personId = activeIdRef.current;
    const pending = `${pendingRef.current} ${liveRef.current}`.trim();
    const phraseEnded = phraseEndedRef.current;
    if (!personId || !shouldExtract(pending, lastSpeechAtRef.current, lastExtractAtRef.current, Date.now(), phraseEnded)) return;

    const person = peopleRef.current.find((item) => item.id === personId);
    if (!person) return;
    extractingRef.current = true;
    const snapshot = pending;
    pendingRef.current = "";
    liveRef.current = "";
    phraseEndedRef.current = false;
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
        pendingRef.current = `${snapshot} ${pendingRef.current}`.trim().slice(-4000);
        if (result.error === "missing_key") {
          setKeyMissing(true);
          setExtractError(null);
        } else {
          setExtractError(result.detail || "Claude could not read that part of the conversation.");
        }
        return;
      }
      const latest = peopleRef.current.find((item) => item.id === personId) ?? person;
      const now = Date.now();
      const updated = applyNotes(latest, result, snapshot, now);
      commitPerson(updated);
      const wrote =
        updated.name !== latest.name ||
        updated.relationship !== latest.relationship ||
        updated.facts.length !== latest.facts.length ||
        updated.reminders.length !== (latest.reminders ?? []).length;
      if (wrote) setHeard("");
      setKeyMissing(false);
      setExtractError(null);
      lastExtractAtRef.current = now;
      timingRef.current.extractMs = Math.round(performance.now() - extractStarted);
    } catch {
      pendingRef.current = `${snapshot} ${pendingRef.current}`.trim().slice(-4000);
      setExtractError("Claude could not be reached.");
    } finally {
      extractingRef.current = false;
    }
  };

  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      void flushRef.current();
    }, 150);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running" || !micOn || yieldMic) return;
    let stopped = false;
    let listener: { stop: () => void } | null = null;
    const timer = window.setTimeout(() => {
      if (stopped) return;
      listener = startListening({
        onInterim: (text) => {
          if (glassesCommand(text) || recallUtterance(text)) return;
          const line = text.trim();
          liveRef.current = line;
          lastSpeechAtRef.current = Date.now();
          phraseEndedRef.current = false;
          setHeard(line);
        },
        onFinal: (text) => {
          if (spokenRef?.current?.(text)) {
            liveRef.current = "";
            phraseEndedRef.current = false;
            setHeard("");
            return;
          }
          const spoken = text.trim();
          const live = liveRef.current.trim();
          const sameUtterance = Boolean(live) && (spoken.startsWith(live) || live.startsWith(spoken));
          const addition = sameUtterance ? spoken : `${live} ${spoken}`.trim();
          const next = `${pendingRef.current} ${addition}`.trim();
          liveRef.current = "";
          pendingRef.current = next.length > 4000 ? next.slice(-4000) : next;
          lastSpeechAtRef.current = Date.now();
          phraseEndedRef.current = true;
          setHeard(addition);
          void flushRef.current();
        },
        onError: (message) => setSpeechError(message),
      });
      if (stopped) {
        listener?.stop();
        return;
      }
      if (!listener) {
        setSpeechError("This browser cannot listen. Open Recall AI in Chrome.");
        return;
      }
      setSpeechError(null);
    }, 160);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      listener?.stop();
    };
  }, [phase, micOn, yieldMic, spokenRef]);

  useEffect(() => {
    if (phase !== "running" || !cameraOn) return;
    const video = videoRef.current;
    if (!video) return;
    return startVisitCamera({
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
      setStatus,
      setReady,
      setPhase,
      setPerf,
      showPerson,
    });
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
    status,
    speechError,
    extractError,
    keyMissing,
    ready,
    heard,
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
      const note = reminderLine(text, person?.name).slice(0, 140);
      if (!person || note.length === 0) return;
      const key = note.toLowerCase();
      if ((person.reminders ?? []).some((item) => reminderLine(item.text, person.name).toLowerCase() === key)) return;
      const now = Date.now();
      commitPerson({
        ...person,
        reminders: [...(person.reminders ?? []), { id: crypto.randomUUID(), text: note, at: now, done: false }],
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
      liveRef.current = "";
      phraseEndedRef.current = false;
      setHeard("");
      setPeople([]);
      showPerson(null, false);
      setConfirmingDelete(false);
      void deleteAllPeople();
    },
  };
}
