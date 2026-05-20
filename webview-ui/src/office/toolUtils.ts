/** Map status prefixes back to tool names for animation selection */
const STATUS_TO_TOOL: Record<string, string> = {
  Reading: 'Read',
  Searching: 'Grep',
  Globbing: 'Glob',
  Fetching: 'WebFetch',
  'Searching web': 'WebSearch',
  Writing: 'Write',
  Editing: 'Edit',
  Running: 'Bash',
  Task: 'Task',
};

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TILE_SIZE,
  ZOOM_DEFAULT_DPR_FACTOR,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../constants.js';
import { isBrowserRuntime } from '../runtime.js';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  const dpr = window.devicePixelRatio || 1;
  if (isBrowserRuntime) {
    const maxByWidth = Math.floor((window.innerWidth * 0.94 * dpr) / (DEFAULT_COLS * TILE_SIZE));
    const maxByHeight = Math.floor((window.innerHeight * 0.88 * dpr) / (DEFAULT_ROWS * TILE_SIZE));
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, maxByWidth, maxByHeight));
  }
  return Math.max(ZOOM_MIN, Math.round(ZOOM_DEFAULT_DPR_FACTOR * dpr));
}
