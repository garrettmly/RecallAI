import { useEffect, useRef, useState, type RefObject } from "react";
import { deleteAllPeople, deletePerson, loadPeople, savePerson } from "../db/book";
import { extractNotes } from "../listen/extract";
import { startListening } from "../listen/speech";
import type { Person } from "../types";
import { detectLargestFace, loadFaceModels, type DetectedFace } from "../vision/match";
import { MAYBE_DISTANCE, MATCH_DISTANCE, STABLE_MS } from "../vision/thresholds";
import { bestMatch, euclidean } from "../../shared/distance.mjs";
import { mergeCard } from "../../server/notes.mjs";

type Phase = "welcome" | "running" | "paused";
type View = "visit" | "memories";

function blankPerson(descriptor: Float32Array): Person {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: null,
    relationship: null,
    facts: [],
    excerpts: [],
    descriptors: [Array.from(descriptor)],
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

export function usePorchlight(videoRef: RefObject<HTMLVideoElement | null>) {
  const [phase, setPhase] = useState<Phase>("welcome");
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

  const peopleRef = useRef<Person[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const pendingRef = useRef("");
  const lastSpeechAtRef = useRef(0);
  const lastExtractAtRef = useRef(0);
  const lastFaceAtRef = useRef(0);
  const extractingRef = useRef(false);
  const stableRef = useRef<{ descriptor: Float32Array; since: number } | null>(null);
  const handleFaceRef = useRef<(face: DetectedFace | null) => void>(() => {});
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancel = false;
    loadPeople()
      .then((rows) => {
        if (cancel) return;
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
        activeIdRef.current = null;
        setActiveId(null);
        setUncertain(false);
      }
      return;
    }

    lastFaceAtRef.current = Date.now();
    const match = bestMatch(face.descriptor, peopleRef.current);
    if (match && match.distance <= MAYBE_DISTANCE) {
      const confident = match.distance <= MATCH_DISTANCE;
      activeIdRef.current = match.id;
      setActiveId(match.id);
      setUncertain(!confident);
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
    activeIdRef.current = person.id;
    setActiveId(person.id);
    setUncertain(false);
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
    try {
      const result = await extractNotes({
        transcript: snapshot,
        current: {
          name: person.name,
          relationship: person.relationship,
          facts: person.facts.map((fact) => fact.text),
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
        },
        result,
      );
      const now = Date.now();
      const facts = merged.facts.map((text: string) => {
        const found = latest.facts.find((fact) => fact.text.toLowerCase() === text.toLowerCase());
        return found ?? { id: crypto.randomUUID(), text, at: now };
      });
      commitPerson({
        ...latest,
        name: merged.name,
        relationship: merged.relationship,
        facts,
        excerpts: [...latest.excerpts, { text: snapshot.slice(0, 280), at: now }].slice(-8),
        updatedAt: now,
        lastSeenAt: now,
      });
      setKeyMissing(false);
      setExtractError(null);
      lastExtractAtRef.current = now;
    } catch {
      pendingRef.current = `${snapshot} ${pendingRef.current}`.trim();
      setExtractError("Claude could not be reached.");
    } finally {
      extractingRef.current = false;
    }
  };

  useEffect(() => {
    if (phase !== "running") return;
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;
    let stopSpeech = () => {};
    let frameTimer = 0;
    let extractTimer = 0;
    let stream: MediaStream | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const face = await detectLargestFace(video);
        if (!stopped) handleFaceRef.current(face);
      } catch {
        // One bad frame should not stop the camera.
      }
      if (!stopped) frameTimer = window.setTimeout(() => void tick(), 300);
    };

    extractTimer = window.setInterval(() => {
      void flushRef.current();
    }, 1000);

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        void video.play().catch(() => {});
        setStatus("Loading face matching on this computer…");
        try {
          await loadFaceModels();
        } catch {
          if (!stopped) {
            setStatus("Face matching did not load. Press Resume to try again.");
            setPhase("paused");
          }
          return;
        }
        if (stopped) return;
        setReady(true);
        setStatus(null);
        const listener = startListening({
          onInterim: (text) => setHearing(text),
          onFinal: (text) => {
            pendingRef.current = `${pendingRef.current} ${text}`.trim();
            lastSpeechAtRef.current = Date.now();
            setHearing(text);
          },
          onError: (message) => setSpeechError(message),
        });
        if (!listener) {
          setSpeechError("This browser cannot listen. Open Porchlight in Chrome.");
        } else {
          stopSpeech = listener.stop;
          setSpeechError(null);
        }
        void tick();
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setReady(false);
        setStatus(
          name === "NotAllowedError"
            ? "The camera is blocked. Allow it in the browser, then press Resume."
            : "The camera did not start. Check that it is plugged in, then press Resume.",
        );
        setPhase("paused");
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(frameTimer);
      window.clearInterval(extractTimer);
      stopSpeech();
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setReady(false);
    };
  }, [phase, videoRef]);

  const active = people.find((person) => person.id === activeId) ?? null;

  return {
    phase,
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
    start: () => {
      setStatus(null);
      setPhase("running");
      setView("visit");
    },
    pause: () => setPhase("paused"),
    resume: () => {
      setStatus(null);
      setPhase("running");
    },
    showVisit: () => setView("visit"),
    showMemories: () => setView("memories"),
    rename: (id: string, name: string) => {
      const person = peopleRef.current.find((item) => item.id === id);
      if (!person) return;
      const nextName = name.replace(/\s+/g, " ").trim().slice(0, 40) || null;
      commitPerson({ ...person, name: nextName, updatedAt: Date.now() });
    },
    remove: (id: string) => {
      peopleRef.current = peopleRef.current.filter((person) => person.id !== id);
      setPeople(peopleRef.current);
      if (activeIdRef.current === id) {
        activeIdRef.current = null;
        setActiveId(null);
        setUncertain(false);
      }
      void deletePerson(id);
    },
    askDeleteAll: () => setConfirmingDelete(true),
    cancelDeleteAll: () => setConfirmingDelete(false),
    removeAll: () => {
      peopleRef.current = [];
      activeIdRef.current = null;
      pendingRef.current = "";
      setPeople([]);
      setActiveId(null);
      setUncertain(false);
      setConfirmingDelete(false);
      void deleteAllPeople();
    },
  };
}
