import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/@vladmandic/face-api/model");
const target = join(root, "public/models");
const needed = /^(tiny_face_detector_model|face_landmark_68_model|face_recognition_model)/;

mkdirSync(target, { recursive: true });
const files = readdirSync(source).filter((name) => needed.test(name));
if (files.length === 0) {
  throw new Error(`No face models found in ${source}`);
}
for (const name of files) {
  copyFileSync(join(source, name), join(target, name));
}
console.log(`Copied ${files.length} face model files into public/models`);
