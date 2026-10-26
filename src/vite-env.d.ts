/// <reference types="vite/client" />

interface RecallAIPerf {
  previewFps: number;
  detectFps: number;
  detectMsAvg: number;
  skipped: number;
  inflight: number;
  matchMs: number | null;
  cameraReadyMs: number | null;
  modelMs: number | null;
  peopleMs: number | null;
  extractMs: number | null;
}

interface Window {
  __recallAIPerf?: RecallAIPerf;
}
