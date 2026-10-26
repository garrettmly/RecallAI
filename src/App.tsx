import { useRef, useState, type RefObject } from "react";
import { glassesCommand, recallUtterance } from "../shared/glassesVoice.mjs";
import { usableNote } from "../shared/memorySearch.mjs";
import { reminderLine } from "../server/notes.mjs";
import { askMemories } from "./listen/ask";
import { useRecallAI } from "./session/useRecallAI";
import { GlassesMode } from "./views/GlassesMode";
import { Memories } from "./views/Memories";
import { MemorySearch } from "./views/MemorySearch";
import { Reminders } from "./views/Reminders";
import { Visit } from "./views/Visit";
import { Welcome } from "./views/Welcome";

function ms(value: number | null): string {
  return value === null ? "—" : `${value} ms`;
}

function shownRelationship(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function PersonCard({
  labelRef,
  name,
  relationship,
  cue,
  heard,
  points,
}: {
  labelRef: RefObject<HTMLElement | null>;
  name: string;
  relationship: string;
  cue?: string;
  heard?: string;
  points: { id: string; text: string }[];
}) {
  return (
    <aside ref={labelRef} className="face-label" aria-live="polite">
      <div className="pills">
        <span className="pill name">{name}</span>
        {relationship ? <span className="pill relation">{relationship}</span> : null}
      </div>
      {cue ? <p className="note reminder">{cue}</p> : null}
      {heard ? <p className="note">{heard}</p> : null}
      {points.length > 0 ? (
        <ul className="note points">
          {points.map((fact) => (
            <li key={fact.id}>{fact.text}</li>
          ))}
        </ul>
      ) : heard ? null : (
        <p className="note">Waiting to hear a name.</p>
      )}
    </aside>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.5 8.2h3.1L8.4 6h7.2l1.8 2.2H20.5a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V9.2a1 1 0 0 1 1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {off ? (
        <path d="M5 19.5L19 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg className="device-mic" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20.2M8.5 20.2h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {off ? (
        <path d="M5 19.5L19 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const labelRef = useRef<HTMLElement>(null);
  const spokenRef = useRef<((text: string) => boolean) | null>(null);
  const app = useRecallAI(videoRef, labelRef, spokenRef);
  const [glasses, setGlasses] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [personNotes, setPersonNotes] = useState(true);
  const [voiceAnswer, setVoiceAnswer] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const armedRef = useRef(0);
  const listening = app.phase === "running" && app.micOn && !app.speechError;

  if (app.phase === "welcome") {
    return (
      <div className="app">
        <Welcome onStart={app.start} />
      </div>
    );
  }

  const live = app.view === "visit";
  const glassesOn = glasses && live && app.cameraOn && app.phase === "running";
  const known = Boolean(app.active && !app.uncertain);
  const points = known ? (app.active?.facts ?? []).slice(-3) : [];
  const openReminder = known ? (app.active?.reminders ?? []).find((item) => !item.done) : undefined;
  const cue = openReminder ? reminderLine(openReminder.text, app.active?.name) : "";
  const relationship = known ? shownRelationship(app.active?.relationship) : "";
  const shell = [
    "app",
    live ? "live" : "",
    glassesOn ? "glasses" : "",
    glassesOn && !notesOpen ? "notes-shut" : "",
    glassesOn && !personNotes ? "person-shut" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function askAloud(question: string) {
    const cleaned = question.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    armedRef.current = 0;
    setGlasses(true);
    setAsked(cleaned);
    setVoiceAnswer(null);
    void answerSpoken(cleaned);
  }

  spokenRef.current = (text) => {
    const wake = recallUtterance(text);
    if (wake) {
      setGlasses(true);
      if (wake.rest) askAloud(wake.rest);
      else {
        armedRef.current = Date.now();
        setAsked(null);
        setVoiceAnswer("Ask your question.");
      }
      return true;
    }
    const waiting = armedRef.current !== 0 && Date.now() - armedRef.current < 12000;
    if (!glassesOn && !waiting) return false;
    const command = glassesCommand(text);
    if (command === "pad-off") {
      armedRef.current = 0;
      setNotesOpen(false);
      return true;
    }
    if (command === "pad-on") {
      armedRef.current = 0;
      setNotesOpen(true);
      return true;
    }
    if (command === "person-off") {
      armedRef.current = 0;
      setPersonNotes(false);
      return true;
    }
    if (command === "person-on") {
      armedRef.current = 0;
      setPersonNotes(true);
      return true;
    }
    if (command === "ask" || waiting) {
      askAloud(text);
      return true;
    }
    return false;
  };

  async function answerSpoken(text: string) {
    const person = known && app.active ? app.active : null;
    if (!person) {
      setVoiceAnswer("Someone needs to be recognized first.");
      return;
    }
    const who = person.name || "This person";
    const memories = [
      ...(person.relationship ? [`${who}: ${person.relationship}`] : []),
      ...person.facts.filter((fact) => usableNote(fact.text)).map((fact) => `${who}: ${fact.text}`),
      ...(person.reminders ?? [])
        .filter((item) => !item.done && usableNote(item.text))
        .map((item) => `${who}: ${item.text}`),
    ];
    if (memories.length === 0) {
      setVoiceAnswer(person.name ? `No memories saved for ${person.name} yet.` : "No memories saved yet.");
      return;
    }
    try {
      const result = await askMemories({
        question: text,
        name: person.name,
        memories: memories.slice(0, 24),
      });
      setVoiceAnswer("error" in result ? "I could not answer that." : result.answer);
    } catch {
      setVoiceAnswer("I could not answer that.");
    }
  }

  return (
    <div className={shell}>
      <video
        ref={videoRef}
        className={live && app.cameraOn ? "camera" : "camera parked"}
        muted
        playsInline
        autoPlay
        aria-label="Camera preview"
      />
      <header className="topbar">
        <p className="wordmark">Recall AI</p>
        <p className={`listen ${listening ? "on" : ""}`} role="status">
          <span className="light" aria-hidden="true" />
          {listening ? "Listening" : !app.cameraOn ? "Camera off" : app.ready ? "Camera on" : "Starting"}
        </p>
        <nav>
          <button
            className={app.view === "visit" ? "secondary current" : "secondary"}
            type="button"
            onClick={app.showVisit}
          >
            Visit
          </button>
          <button
            className={glassesOn ? "secondary current" : "secondary"}
            type="button"
            onClick={() => setGlasses((on) => !on)}
          >
            Glasses
          </button>
        </nav>
      </header>

      {glassesOn ? null : live ? (
        <Reminders
          people={app.people}
          personId={known && app.active ? app.active.id : null}
          onAdd={app.addNote}
          onDelete={app.removeNote}
        />
      ) : null}

      <div className="stage">
        {app.view === "visit" ? (
          <Visit
            ready={app.ready}
            paused={app.phase === "paused"}
            status={app.status}
            speechError={app.speechError}
            extractError={app.extractError}
            keyMissing={app.keyMissing}
          />
        ) : (
          <Memories
            people={app.people}
            confirmingDelete={app.confirmingDelete}
            onRename={app.rename}
            onRemove={app.remove}
            onAskDeleteAll={app.askDeleteAll}
            onCancelDeleteAll={app.cancelDeleteAll}
            onRemoveAll={app.removeAll}
          />
        )}
      </div>
      {glassesOn ? null : (
        <div className="bottom-bar">
          <button
            className={app.cameraOn ? "device" : "device off"}
            type="button"
            onClick={app.toggleCamera}
            aria-label={app.cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            <CameraIcon off={!app.cameraOn} />
          </button>
          <button
            className={app.micOn ? "device" : "device off"}
            type="button"
            onClick={app.toggleMic}
            aria-label={app.micOn ? "Turn microphone off" : "Turn microphone on"}
          >
            <MicIcon off={!app.micOn} />
          </button>
          <MemorySearch
            person={known ? app.active : null}
            onListenHold={app.holdListening}
            onVoiceError={app.reportSpeechError}
          />
        </div>
      )}
      {glassesOn ? (
        <GlassesMode
          videoRef={videoRef}
          notes={
            <Reminders
              people={app.people}
              personId={known && app.active ? app.active.id : null}
              onAdd={app.addNote}
              onDelete={app.removeNote}
            />
          }
          person={
            <PersonCard
              labelRef={labelRef}
              name={known && app.active?.name ? app.active.name : "Listening"}
              relationship={relationship}
              cue={cue}
              heard={app.heard}
              points={points}
            />
          }
        />
      ) : null}
      {glassesOn && (asked || voiceAnswer) ? (
        <div className="glasses-answer" role="status">
          {asked ? <p className="glasses-question">{asked}</p> : null}
          {voiceAnswer ? <p>{voiceAnswer}</p> : null}
        </div>
      ) : null}
      {!glassesOn && live && app.phase === "running" && app.cameraOn ? (
        <PersonCard
          labelRef={labelRef}
          name={known && app.active?.name ? app.active.name : "Listening"}
          relationship={relationship}
          cue={cue}
          heard={app.heard}
          points={points}
        />
      ) : null}
      {app.perf ? (
        <pre className="perf">
          {`camera ${ms(app.perf.cameraReadyMs)}   models ${ms(app.perf.modelMs)}   book ${ms(app.perf.peopleMs)}\nmatch ${ms(app.perf.matchMs)}   extract ${ms(app.perf.extractMs)}\npreview ${app.perf.previewFps} fps   detect ${app.perf.detectFps} fps   ${app.perf.detectMsAvg} ms\nskipped ${app.perf.skipped}`}
        </pre>
      ) : null}
    </div>
  );
}
