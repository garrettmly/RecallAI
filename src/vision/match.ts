const MODEL_URL = "/models";

export type DetectedFace = {
  descriptor: Float32Array;
  area: number;
};

type FaceApi = typeof import("@vladmandic/face-api");

let apiPromise: Promise<FaceApi> | null = null;
let modelsPromise: Promise<void> | null = null;

function loadApi(): Promise<FaceApi> {
  if (!apiPromise) apiPromise = import("@vladmandic/face-api");
  return apiPromise;
}

export function loadFaceModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = loadApi()
      .then((faceapi) =>
        Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]),
      )
      .then(() => undefined)
      .catch((error) => {
        modelsPromise = null;
        throw error;
      });
  }
  return modelsPromise;
}

export async function detectLargestFace(video: HTMLVideoElement): Promise<DetectedFace | null> {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const faceapi = await loadApi();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.45,
  });
  const faces = await faceapi
    .detectAllFaces(video, options)
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (faces.length === 0) return null;
  const largest = faces.reduce((best, face) => {
    const area = face.detection.box.width * face.detection.box.height;
    const bestArea = best.detection.box.width * best.detection.box.height;
    return area > bestArea ? face : best;
  });
  return {
    descriptor: largest.descriptor,
    area: largest.detection.box.width * largest.detection.box.height,
  };
}
