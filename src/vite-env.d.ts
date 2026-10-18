/// <reference types="vite/client" />

interface PorchlightPerf {
  previewFps: number;
  detectFps: number;
  detectMsAvg: number;
  detectMsP95: number;
  skipped: number;
  inflight: number;
  matchMs: number | null;
  cameraReadyMs: number | null;
  modelMs: number | null;
  peopleMs: number | null;
  heardMs: number | null;
  shownMs: number | null;
  finalMs: number | null;
  extractMs: number | null;
  longTaskCount: number;
  longTaskMs: number;
}

interface Window {
  __porchlightPerf?: PorchlightPerf;
}
