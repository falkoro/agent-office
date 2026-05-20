/**
 * Browser-side bridge for the standalone WSL service.
 *
 * The React app already understands extension-style `window.message` events.
 * The service streams those same payloads over SSE, so this bridge only has to
 * parse JSON and re-dispatch it locally.
 */

let eventSource: EventSource | null = null;

export function connectStandaloneEvents(): void {
  if (eventSource) return;

  const healthUrl = new URL('/api/health', window.location.href);
  fetch(healthUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`standalone health returned ${response.status.toString()}`);
      }
      eventSource = new EventSource(new URL('/api/events', window.location.href));
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as unknown;
          window.dispatchEvent(new MessageEvent('message', { data }));
        } catch (error) {
          console.warn('[StandaloneClient] Ignored invalid event:', error);
        }
      };
      eventSource.onerror = () => {
        console.warn('[StandaloneClient] Event stream disconnected; browser will retry.');
      };
    })
    .catch(() => {
      // Vite dev server and VS Code webviews do not expose /api/health. Silent fallback keeps
      // the original browser mock useful while developing the canvas UI.
    });
}
