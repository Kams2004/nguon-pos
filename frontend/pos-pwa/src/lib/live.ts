// Live server events (SSE) over fetch rather than EventSource: EventSource
// can't send an Authorization header, and putting the JWT in the URL would
// leak it into nginx access logs. Reconnects with backoff forever — a till
// that goes offline simply resumes its stream when the network returns.

export type LiveEvent = { type: string; data?: unknown };

export function openLiveStream(
  token: string,
  terminalId: string | null,
  onEvent: (e: LiveEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryMs = 1_000;

  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const url = `/api/sales/sales/events${terminalId ? `?terminalId=${terminalId}` : ""}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        onStatus(true);
        retryMs = 1_000;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          // SSE frames are separated by a blank line; data may span several "data:" lines.
          let sep: number;
          while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
            const data = frame
              .split(/\r?\n/)
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).replace(/^ /, ""))
              .join("\n");
            if (!data) continue; // comment/ping frame
            try {
              onEvent(JSON.parse(data) as LiveEvent);
            } catch {
              /* ignore a malformed frame rather than drop the stream */
            }
          }
        }
      } catch {
        /* network error or abort — fall through to retry */
      }
      onStatus(false);
      if (stopped) return;
      await new Promise((r) => setTimeout(r, retryMs));
      retryMs = Math.min(retryMs * 2, 15_000);
    }
  };

  run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
