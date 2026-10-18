// TensorFlow decides it is in a browser only when these page globals exist.
// A worker has none of them, so define the ones it checks before it loads.
const scope = globalThis as unknown as Record<string, unknown>;
scope.window = globalThis;
scope.document = {
  createElement(tag: string) {
    if (tag === "canvas") return new OffscreenCanvas(2, 2);
    throw new Error(`This worker cannot create ${tag}.`);
  },
};
scope.HTMLCanvasElement = scope.HTMLCanvasElement ?? OffscreenCanvas;
scope.HTMLImageElement = scope.HTMLImageElement ?? class HTMLImageElement {};
scope.HTMLVideoElement = scope.HTMLVideoElement ?? class HTMLVideoElement {};
scope.CanvasRenderingContext2D = scope.CanvasRenderingContext2D ?? OffscreenCanvasRenderingContext2D;

const queued: MessageEvent[] = [];
self.onmessage = (event) => queued.push(event);

try {
  const runtime = await import("./recognizeRuntime");
  const deliver = (event: MessageEvent) => runtime.handle(event as Parameters<typeof runtime.handle>[0]);
  self.onmessage = deliver;
  for (const event of queued) deliver(event);
} catch (error) {
  self.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : "Face matching did not load.",
  });
}

export {};
