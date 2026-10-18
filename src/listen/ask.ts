export async function askMemories(input: {
  question: string;
  name: string | null;
  memories: string[];
}): Promise<{ answer: string; relevant: string[] } | { error: string; detail?: string }> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as {
    answer?: string;
    relevant?: string[];
    error?: string;
    detail?: string;
  };
  if (!response.ok) return { error: body.error || "ask_failed", detail: body.detail };
  return {
    answer: body.answer || "I do not have that memory.",
    relevant: Array.isArray(body.relevant) ? body.relevant.filter((line) => typeof line === "string") : [],
  };
}
