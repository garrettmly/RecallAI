import { handleExtract } from "../server/extract.mjs";

export const maxDuration = 60;

export default function handler(req, res) {
  return handleExtract(req, res, process.env);
}
