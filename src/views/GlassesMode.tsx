import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const LEFT =
  "M 0.07 0.08 H 0.42 Q 0.497 0.08 0.497 0.18 V 0.82 Q 0.497 0.94 0.42 0.94 H 0.08 Q 0.015 0.94 0.015 0.82 V 0.18 Q 0.015 0.08 0.07 0.08 Z";
const RIGHT =
  "M 0.93 0.08 H 0.58 Q 0.503 0.08 0.503 0.18 V 0.82 Q 0.503 0.94 0.58 0.94 H 0.92 Q 0.985 0.94 0.985 0.82 V 0.18 Q 0.985 0.08 0.93 0.08 Z";
const BRIDGE = "M 0.497 0.22 H 0.503";

export function GlassesMode({
  videoRef,
  notes,
  person,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  notes: ReactNode;
  person: ReactNode;
}) {
  const cameraRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.srcObject = videoRef.current?.srcObject ?? null;
    void camera.play().catch(() => {});
  }, [videoRef]);

  return (
    <div className="glasses-mode">
      <svg className="glasses-defs" width="0" height="0" aria-hidden="true">
        <defs>
          <clipPath id="glasses-lens-clip" clipPathUnits="objectBoundingBox">
            <path d={LEFT} />
            <path d={RIGHT} />
          </clipPath>
        </defs>
      </svg>
      <div className="glasses-lens">
        <div className="glasses-fill">
          <video ref={cameraRef} className="glasses-slit" muted playsInline autoPlay />
          <div className="glasses-hud">
            <div className="glasses-slot">{notes}</div>
            <div className="glasses-slot person">{person}</div>
          </div>
        </div>
        <svg className="glasses-outline" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <path d={LEFT} fill="none" stroke="rgba(255, 250, 243, 0.92)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <path d={RIGHT} fill="none" stroke="rgba(255, 250, 243, 0.92)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <path d={BRIDGE} fill="none" stroke="rgba(255, 250, 243, 0.92)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}
