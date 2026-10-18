type VisitProps = {
  ready: boolean;
  paused: boolean;
  status: string | null;
  speechError: string | null;
  extractError: string | null;
  keyMissing: boolean;
};

export function Visit({
  paused,
  status,
  speechError,
  extractError,
  keyMissing,
}: VisitProps) {
  const notices = [
    keyMissing
      ? "Add your Anthropic key to a .env file and restart. The microphone still works, but memories will not be written until Claude can read the conversation."
      : null,
    speechError,
    extractError,
    status,
    paused ? "Paused. The camera and microphone are off." : null,
  ].filter((notice): notice is string => Boolean(notice));

  if (notices.length === 0) return null;

  return (
    <section className="visit notices" aria-live="polite">
      {notices.map((notice) => (
        <p className="banner" role="status" key={notice}>
          {notice}
        </p>
      ))}
    </section>
  );
}
