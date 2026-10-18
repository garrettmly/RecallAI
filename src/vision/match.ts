export type DetectedFace = {
  descriptor: Float32Array;
  area: number;
};

export type NormBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};
