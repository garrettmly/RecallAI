import { useRef } from "react";
import { usePorchlight } from "./session/usePorchlight";
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
  const app = usePorchlight(videoRef, labelRef);
  const listening = app.phase === "running" && app.micOn && !app.speechError;

  if (app.phase === "welcome") {
    return (
      <div className="app">
        <Welcome onStart={app.start} />
      </div>
    );
  }

  const live = app.view === "visit";
  const known = Boolean(app.active && !app.uncertain);
  const points = known ? (app.active?.facts ?? []).slice(-3) : [];
  const cue = known ? (app.active?.reminders ?? []).find((item) => !item.done) : undefined;
  const relationship = known ? shownRelationship(app.active?.relationship) : "";

  return (
    <div className={live ? "app live" : "app"}>
      <video
        ref={videoRef}
        className={live && app.cameraOn ? "camera" : "camera parked"}
        muted
        playsInline
        autoPlay
        aria-label="Camera preview"
      />
      <header className="topbar">
        <p className="wordmark">Porchlight</p>
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
        </nav>
      </header>

      {live ? <Reminders people={app.people} /> : null}

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
      {live && app.phase === "running" && app.cameraOn ? (
        <aside ref={labelRef} className="face-label" aria-live="polite">
          <div className="pills">
            <span className="pill name">{known && app.active?.name ? app.active.name : "Listening"}</span>
            {relationship ? <span className="pill relation">{relationship}</span> : null}
          </div>
          {cue ? <p className="note reminder">{cue.text}</p> : null}
          {points.length > 0 ? (
            <ul className="note points">
              {points.map((fact) => (
                <li key={fact.id}>{fact.text}</li>
              ))}
            </ul>
          ) : (
            <p className="note">Waiting to hear a name.</p>
          )}
        </aside>
      ) : null}
      {app.perf ? (
        <pre className="perf">
          {`camera ${ms(app.perf.cameraReadyMs)}   models ${ms(app.perf.modelMs)}   book ${ms(app.perf.peopleMs)}\nmatch ${ms(app.perf.matchMs)}\nspeech heard ${ms(app.perf.heardMs)}   shown ${ms(app.perf.shownMs)}   final ${ms(app.perf.finalMs)}\nextract ${ms(app.perf.extractMs)}\npreview ${app.perf.previewFps} fps   detect ${app.perf.detectFps} fps  ${app.perf.detectMsAvg}/${app.perf.detectMsP95} ms\nskipped ${app.perf.skipped}   long tasks ${app.perf.longTaskCount} (${app.perf.longTaskMs} ms)`}
        </pre>
      ) : null}
    </div>
  );
}
