import { isBrowserRuntime } from './runtime';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

function postStandaloneMessage(msg: unknown): void {
  console.log('[vscode.postMessage]', msg);
  const url = new URL('/api/client-message', window.location.href);
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
  }).catch(() => {
    // Browser mock / Vite dev has no standalone server. Logging above is enough there.
  });
}

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? { postMessage: postStandaloneMessage }
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
