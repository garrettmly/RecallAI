export function recallUtterance(text: string): { rest: string } | null;

export function glassesCommand(
  text: string,
): "pad-off" | "pad-on" | "person-off" | "person-on" | "ask" | "wake" | null;
