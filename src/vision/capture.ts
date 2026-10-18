type FrameProcessor = new (init: { track: MediaStreamTrack; maxBufferSize?: number }) => {
  readable: ReadableStream<VideoFrame>;
};

export function openDetectorStream(track: MediaStreamTrack): { frames: ReadableStream<VideoFrame>; stop: () => void } | null {
  const Processor = (globalThis as { MediaStreamTrackProcessor?: FrameProcessor }).MediaStreamTrackProcessor;
  if (!Processor) return null;
  const clone = track.clone();
  const processor = new Processor({ track: clone, maxBufferSize: 1 });
  return {
    frames: processor.readable,
    stop: () => clone.stop(),
  };
}
