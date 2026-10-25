import type { NormBox } from "./match";

type AxisFilter = {
  hat: number;
  rate: number;
  at: number;
};

export type LabelMotion = {
  target: NormBox | null;
  x: AxisFilter | null;
  y: AxisFilter | null;
  w: AxisFilter | null;
  h: AxisFilter | null;
  left: number | null;
  top: number | null;
  side: "left" | "right";
  lastTime: number;
  measuredAt: number;
  labelWidth: number;
  labelHeight: number;
  layoutAt: number;
  layout: { left: number; top: number; width: number; height: number } | null;
  movingAt: number;
  paintedLeft: number | null;
  paintedTop: number | null;
};

export function createLabelMotion(): LabelMotion {
  return {
    target: null,
    x: null,
    y: null,
    w: null,
    h: null,
    left: null,
    top: null,
    side: "right",
    lastTime: 0,
    measuredAt: 0,
    labelWidth: 280,
    labelHeight: 180,
    layoutAt: 0,
    layout: null,
    movingAt: 0,
    paintedLeft: null,
    paintedTop: null,
  };
}

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

function filterAxis(axis: AxisFilter | null, value: number, now: number, deadzone: number, cutoff: number): AxisFilter {
  if (!axis) return { hat: value, rate: 0, at: now };
  const dt = (now - axis.at) / 1000;
  if (dt <= 0.004) return { ...axis, at: now };
  if (dt > 0.25) return { hat: value, rate: 0, at: now };
  if (Math.abs(value - axis.hat) < deadzone) return { hat: axis.hat, rate: 0, at: now };
  const alpha = smoothingAlpha(cutoff, dt);
  return { hat: value * alpha + axis.hat * (1 - alpha), rate: 0, at: now };
}

export function noteFace(motion: LabelMotion, box: NormBox, capturedAt: number): void {
  motion.target = box;
  const previousX = motion.x?.hat;
  const previousY = motion.y?.hat;
  motion.x = filterAxis(motion.x, box.x, capturedAt, 0.012, 2.2);
  motion.y = filterAxis(motion.y, box.y, capturedAt, 0.012, 2.2);
  motion.w = filterAxis(motion.w, box.width, capturedAt, 0.02, 0.8);
  motion.h = filterAxis(motion.h, box.height, capturedAt, 0.02, 0.8);
  if (
    previousX !== undefined &&
    previousY !== undefined &&
    Math.hypot(motion.x.hat - previousX, motion.y.hat - previousY) > 0.02
  ) {
    motion.movingAt = capturedAt;
  }
}

export function clearFace(motion: LabelMotion): void {
  motion.target = null;
  motion.x = null;
  motion.y = null;
  motion.w = null;
  motion.h = null;
}

function boxUsable(box: NormBox): boolean {
  return [box.x, box.y, box.width, box.height].every((value) => Number.isFinite(value)) && box.width > 0.02 && box.height > 0.02;
}

function faceNow(motion: LabelMotion): NormBox | null {
  if (!motion.x || !motion.y || !motion.w || !motion.h) return null;
  const box = {
    x: motion.x.hat,
    y: motion.y.hat,
    width: motion.w.hat,
    height: motion.h.hat,
  };
  return boxUsable(box) ? box : null;
}

function coverPlacement(video: HTMLVideoElement, box: NormBox, motion: LabelMotion, now: number) {
  if (!motion.layout || now - motion.layoutAt > 300) {
    const rect = video.getBoundingClientRect();
    motion.layout = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    motion.layoutAt = now;
  }
  const rect = motion.layout;
  const videoAspect = video.videoWidth / video.videoHeight;
  const elementAspect = rect.width / Math.max(rect.height, 1);
  let renderedWidth: number;
  let renderedHeight: number;
  let offsetX: number;
  let offsetY: number;
  if (videoAspect > elementAspect) {
    renderedHeight = rect.height;
    renderedWidth = rect.height * videoAspect;
    offsetX = (rect.width - renderedWidth) / 2;
    offsetY = 0;
  } else {
    renderedWidth = rect.width;
    renderedHeight = rect.width / videoAspect;
    offsetX = 0;
    offsetY = (rect.height - renderedHeight) / 2;
  }
  const mirroredX = 1 - box.x - box.width;
  return {
    x: rect.left + offsetX + mirroredX * renderedWidth,
    y: rect.top + offsetY + box.y * renderedHeight,
    width: box.width * renderedWidth,
    height: box.height * renderedHeight,
  };
}

export function stepLabel(
  video: HTMLVideoElement,
  label: HTMLElement,
  motion: LabelMotion,
  now: number,
): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - (motion.lastTime || now)) / 1000));
  motion.lastTime = now;
  const settle = 1 - Math.exp(-12 * dt);

  if (now - motion.measuredAt > 250) {
    motion.labelWidth = label.offsetWidth || motion.labelWidth;
    motion.labelHeight = label.offsetHeight || motion.labelHeight;
    motion.measuredAt = now;
  }

  if (!motion.layout || now - motion.layoutAt > 300) {
    const rect = video.getBoundingClientRect();
    motion.layout = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    motion.layoutAt = now;
  }
  const bounds = motion.layout;
  const inGlasses = bounds.width < window.innerWidth - 24 || bounds.height < window.innerHeight - 24;
  const edge = inGlasses ? 12 : 16;

  let desiredLeft = inGlasses
    ? bounds.left + bounds.width * 0.56
    : Math.min(window.innerWidth - motion.labelWidth - 16, Math.max(16, window.innerWidth * 0.56));
  let desiredTop = inGlasses ? bounds.top + bounds.height * 0.18 : Math.max(88, window.innerHeight * 0.22);

  const predicted = video.videoWidth > 0 && video.videoHeight > 0 ? faceNow(motion) : null;
  if (predicted) {
    const face = coverPlacement(video, predicted, motion, now);
    const gap = 18;
    const right = face.x + face.width + gap;
    const leftSide = face.x - gap - motion.labelWidth;
    const limitRight = inGlasses ? bounds.left + bounds.width - edge : window.innerWidth - 16;
    const limitLeft = inGlasses ? bounds.left + edge : 16;
    const fitsRight = right + motion.labelWidth <= limitRight;
    const fitsLeft = leftSide >= limitLeft;
    if (motion.side === "right" && !fitsRight && fitsLeft) motion.side = "left";
    if (motion.side === "left" && !fitsLeft && fitsRight) motion.side = "right";
    desiredLeft = motion.side === "right" ? right : leftSide;
    desiredTop = face.y + face.height * 0.08;
  }

  if (inGlasses) {
    desiredLeft = Math.max(bounds.left + edge, Math.min(desiredLeft, bounds.left + bounds.width - motion.labelWidth - edge));
    desiredTop = Math.max(bounds.top + edge, Math.min(desiredTop, bounds.top + bounds.height - motion.labelHeight - edge));
  } else {
    desiredLeft = Math.max(16, Math.min(desiredLeft, window.innerWidth - motion.labelWidth - 16));
    desiredTop = Math.max(72, Math.min(desiredTop, window.innerHeight - motion.labelHeight - 16));
  }
  if (!Number.isFinite(desiredLeft) || !Number.isFinite(desiredTop)) return;

  if (motion.left === null || motion.top === null) {
    motion.left = desiredLeft;
    motion.top = desiredTop;
  } else if (Math.hypot(desiredLeft - motion.left, desiredTop - motion.top) >= 4) {
    motion.left += (desiredLeft - motion.left) * settle;
    motion.top += (desiredTop - motion.top) * settle;
  }

  const paintedLeft = Math.round(motion.left);
  const paintedTop = Math.round(motion.top);
  if (label.style.opacity !== "1") label.style.opacity = "1";
  if (motion.paintedLeft !== paintedLeft || motion.paintedTop !== paintedTop) {
    motion.paintedLeft = paintedLeft;
    motion.paintedTop = paintedTop;
    label.style.transform = `translate3d(${paintedLeft}px, ${paintedTop}px, 0)`;
  }
}
