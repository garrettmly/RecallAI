import { useRef } from "react";
import { usePorchlight } from "./session/usePorchlight";
import { Memories } from "./views/Memories";
import { Visit } from "./views/Visit";
import { Welcome } from "./views/Welcome";

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const app = usePorchlight(videoRef);
  const listening = app.phase === "running" && app.ready && !app.speechError;

  if (app.phase === "welcome") {
    return (
      <div className="app">
        <Welcome onStart={app.start} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <p className="wordmark">Porchlight</p>
        <p className={`listen ${listening ? "on" : ""}`} role="status">
          <span className="light" aria-hidden="true" />
          {listening ? "Listening" : app.phase === "paused" ? "Paused" : app.ready ? "Camera on" : "Starting"}
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
            className={app.view === "memories" ? "secondary current" : "secondary"}
            type="button"
            onClick={app.showMemories}
          >
            Memories
          </button>
          {app.phase === "running" ? (
            <button className="secondary" type="button" onClick={app.pause}>
              Pause
            </button>
          ) : (
            <button className="primary" type="button" onClick={app.resume}>
              Resume
            </button>
          )}
        </nav>
      </header>

      <div className="stage">
        {app.view === "visit" ? (
          <Visit
            person={app.active}
            uncertain={app.uncertain}
            hearing={app.hearing}
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
        <div className="camera-wrap">
          <video ref={videoRef} className="camera" muted playsInline aria-label="Camera preview" />
          {app.phase === "paused" ? <p className="camera-note">Camera off</p> : null}
        </div>
      </div>
    </div>
  );
}
