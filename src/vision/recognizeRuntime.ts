import * as faceapi from "@vladmandic/face-api";

type Inbound =
  | { type: "init"; modelUrl: string }
  | { type: "frame"; bitmap: ImageBitmap }
  | { type: "stop" };

type Outbound =
  | { type: "ready"; elapsed: number }
  | { type: "error"; message: string }
  | { type: "descriptor"; descriptor: Float32Array | null };

let models: Promise<void> | null = null;

const tf = faceapi.tf as typeof faceapi.tf & {
  setBackend(name: string): Promise<boolean>;
  ready(): Promise<void>;
};

function post(message: Outbound, transfer?: Transferable[]) {
  self.postMessage(message, { transfer: transfer ?? [] });
}

function loadModels(modelUrl: string): Promise<void> {
  if (models) return models;
  const started = performance.now();
  const loading = tf
    .setBackend("cpu")
    .then(() => tf.ready())
    .then(() =>
      Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl),
      ]),
    )
    .then(() => {
      post({ type: "ready", elapsed: Math.round(performance.now() - started) });
    })
    .catch((error: unknown) => {
      models = null;
      post({
        type: "error",
        message: error instanceof Error ? error.message : "Face matching did not load.",
      });
      throw error;
    });
  models = loading;
  return loading;
}

async function recognize(bitmap: ImageBitmap) {
  let tensor: faceapi.tf.Tensor3D | null = null;
  try {
    tensor = tf.browser.fromPixels(bitmap);
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });
    const faces = await faceapi.detectAllFaces(tensor, options).withFaceLandmarks().withFaceDescriptors();
    if (faces.length === 0) {
      post({ type: "descriptor", descriptor: null });
      return;
    }
    const largest = faces.reduce((best, face) => {
      const area = face.detection.box.width * face.detection.box.height;
      const bestArea = best.detection.box.width * best.detection.box.height;
      return area > bestArea ? face : best;
    });
    const copy = new Float32Array(largest.descriptor);
    post({ type: "descriptor", descriptor: copy }, [copy.buffer]);
  } catch {
    post({ type: "descriptor", descriptor: null });
  } finally {
    bitmap.close();
    tensor?.dispose();
  }
}

export function handle(event: MessageEvent<Inbound>) {
  const data = event.data;
  if (data.type === "init") {
    void loadModels(data.modelUrl);
    return;
  }
  if (data.type === "stop") return;
  if (!models) {
    data.bitmap.close();
    post({ type: "descriptor", descriptor: null });
    return;
  }
  void models.then(() => recognize(data.bitmap)).catch(() => {
    data.bitmap.close();
    post({ type: "descriptor", descriptor: null });
  });
};
