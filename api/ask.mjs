import { handleAsk } from "../server/ask.mjs";

export const maxDuration = 60;

export default function handler(req, res) {
  return handleAsk(req, res, process.env);
}
