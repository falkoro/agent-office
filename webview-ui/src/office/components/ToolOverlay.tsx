import { useEffect, useState } from 'react';

import { cleanActivityText } from '../../agentDisplay.js';
import { getAgentNumbers } from '../../agentNumbers.js';
import { Button } from '../../components/ui/Button.js';
import {
  CHARACTER_SITTING_OFFSET_PX,
  FUEL_COLOR_CRITICAL,
  FUEL_COLOR_DANGER,
  FUEL_COLOR_OK,
  FUEL_COLOR_WARN,
  FUEL_GAUGE_BG,
  FUEL_GAUGE_HEIGHT_PX,
  FUEL_GAUGE_WIDTH_PX,
  MAX_CONTEXT_TOKENS,
  TEAM_LEAD_COLOR,
  TEAM_ROLE_COLOR,
  TOKEN_CRITICAL_THRESHOLD,
  TOKEN_DANGER_THRESHOLD,
  TOKEN_WARN_THRESHOLD,
  TOOL_OVERLAY_VERTICAL_OFFSET,
} from '../../constants.js';
import type { SubagentCharacter } from '../../hooks/useExtensionMessages.js';
import type { OfficeState } from '../engine/officeState.js';
import type { Character, ToolActivity } from '../types.js';
import { CharacterState, TILE_SIZE } from '../types.js';

interface ToolOverlayProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  onCloseAgent: (id: number) => void;
  alwaysShowOverlay: boolean;
}

/** Derive a short human-readable activity string from tools/status */
function getActivityText(
  agentId: number,
  agentTools: Record<number, ToolActivity[]>,
  ch: Character,
): string {
  const tools = agentTools[agentId];
  if (tools && tools.length > 0) {
    // Find the latest non-done tool
    const activeTool = [...tools].reverse().find((t) => !t.done);
    if (activeTool) {
      if (activeTool.permissionWait) return 'Needs approval';
      return cleanActivityText(activeTool.status, getProviderLabel(ch.folderName));
    }
    // All tools done but agent still active (mid-turn) — keep showing last tool status
    if (ch.isActive) {
      const lastTool = tools[tools.length - 1];
      if (lastTool) return cleanActivityText(lastTool.status, getProviderLabel(ch.folderName));
    }
  }

  return 'Idle';
}

function getFuelColor(ratio: number): string {
  if (ratio >= TOKEN_CRITICAL_THRESHOLD) return FUEL_COLOR_CRITICAL;
  if (ratio >= TOKEN_DANGER_THRESHOLD) return FUEL_COLOR_DANGER;
  if (ratio >= TOKEN_WARN_THRESHOLD) return FUEL_COLOR_WARN;
  return FUEL_COLOR_OK;
}

interface OverlayItem {
  id: number;
  agentNumber: string;
  ch: Character;
  isSelected: boolean;
  isHovered: boolean;
  isSub: boolean;
  compact: boolean;
  dense: boolean;
  activityText: string;
  dotColor: string | null;
  aliasLabel?: string;
  teamRoleLabel?: string | null;
  folderName?: string;
  isTeamAgent: boolean;
  totalTokens: number;
  tokenRatio: number;
  screenX: number;
  screenY: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

const OVERLAY_MARGIN_PX = 8;
const OVERLAY_GAP_PX = 6;
const COMPACT_OVERLAY_WIDTH_PX = 208;
const DENSE_OVERLAY_WIDTH_PX = 136;
const FULL_OVERLAY_WIDTH_PX = 320;

function overlaps(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  return (
    a.left < b.left + b.width + OVERLAY_GAP_PX &&
    a.left + a.width + OVERLAY_GAP_PX > b.left &&
    a.top < b.top + b.height + OVERLAY_GAP_PX &&
    a.top + a.height + OVERLAY_GAP_PX > b.top
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function placeOverlayItems(
  items: OverlayItem[],
  viewportW: number,
  viewportH: number,
): OverlayItem[] {
  const placed: OverlayItem[] = [];
  const sorted = [...items].sort((a, b) => {
    const priorityA = a.isSelected ? 2 : a.isHovered ? 1 : 0;
    const priorityB = b.isSelected ? 2 : b.isHovered ? 1 : 0;
    if (priorityA !== priorityB) return priorityB - priorityA;
    if (a.screenY !== b.screenY) return a.screenY - b.screenY;
    return a.screenX - b.screenX;
  });

  for (const item of sorted) {
    const maxLeft = Math.max(OVERLAY_MARGIN_PX, viewportW - item.width - OVERLAY_MARGIN_PX);
    const maxTop = Math.max(OVERLAY_MARGIN_PX, viewportH - item.height - OVERLAY_MARGIN_PX);
    const baseLeft = clamp(Math.round(item.screenX - item.width / 2), OVERLAY_MARGIN_PX, maxLeft);
    const preferredTop = clamp(
      Math.round(item.screenY - item.height - (item.compact ? 6 : 12)),
      OVERLAY_MARGIN_PX,
      maxTop,
    );

    let bestTop = preferredTop;
    for (let i = 0; i < 18; i++) {
      const lane = Math.ceil(i / 2);
      const direction = i % 2 === 0 ? 1 : -1;
      const candidateTop =
        i === 0
          ? preferredTop
          : clamp(
              preferredTop + direction * lane * (item.height + OVERLAY_GAP_PX),
              OVERLAY_MARGIN_PX,
              maxTop,
            );
      const candidate = {
        left: baseLeft,
        top: candidateTop,
        width: item.width,
        height: item.height,
      };
      if (!placed.some((other) => overlaps(candidate, other))) {
        bestTop = candidateTop;
        break;
      }
    }

    placed.push({ ...item, left: baseLeft, top: bestTop });
  }

  return placed.sort((a, b) => a.id - b.id);
}

function getProviderLabel(folderName: string | undefined): string | undefined {
  if (!folderName) return undefined;
  const match = folderName.match(/^([A-Za-z]+)\s+\d+\s+·/);
  return match?.[1] ?? folderName;
}

function getCompactLabel(item: OverlayItem): string {
  if (item.dense) return item.activityText;
  const name =
    item.aliasLabel ||
    item.teamRoleLabel ||
    (item.isSub ? 'Subagent' : getProviderLabel(item.folderName));
  if (!name) return item.activityText;
  if (item.activityText.toLowerCase().startsWith(`${name.toLowerCase()}:`)) {
    return item.activityText;
  }
  return `${name}: ${item.activityText}`;
}

export function ToolOverlay({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
  containerRef,
  zoom,
  panRef,
  onCloseAgent,
  alwaysShowOverlay,
}: ToolOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const el = containerRef.current;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  // All character IDs
  const allIds = [...agents, ...subagentCharacters.map((s) => s.id)];
  const overlayItems: OverlayItem[] = [];
  const agentNumbers = getAgentNumbers(agents, subagentCharacters);
  const denseCompact =
    rect.width < 980 || allIds.length > Math.max(6, Math.floor(rect.width / 170));

  for (const id of allIds) {
    const ch = officeState.characters.get(id);
    if (!ch) continue;

    const isSelected = selectedId === id;
    const isHovered = hoveredId === id;
    const isSub = ch.isSubagent;

    // Only show for hovered or selected agents (unless always-show is on)
    if (!alwaysShowOverlay && !isSelected && !isHovered) continue;

    // Position above character
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
    const screenY =
      (deviceOffsetY + (ch.y + sittingOffset - TOOL_OVERLAY_VERTICAL_OFFSET) * zoom) / dpr;

    // Get activity text
    const subHasPermission = isSub && ch.bubbleType === 'permission';
    let activityText: string;
    if (isSub) {
      const meta = officeState.subagentMeta.get(id);
      const subTools = meta ? subagentTools[meta.parentAgentId]?.[meta.parentToolId] : undefined;
      const activeSubTool = subTools ? [...subTools].reverse().find((tool) => !tool.done) : null;
      if (subHasPermission || activeSubTool?.permissionWait) {
        activityText = 'Needs approval';
      } else if (activeSubTool) {
        const parentCh = meta ? officeState.characters.get(meta.parentAgentId) : undefined;
        activityText = cleanActivityText(
          activeSubTool.status,
          getProviderLabel(parentCh?.folderName),
        );
      } else {
        const sub = subagentCharacters.find((s) => s.id === id);
        activityText = sub ? sub.label : 'Subtask';
      }
    } else {
      activityText = getActivityText(id, agentTools, ch);
    }

    // Determine dot color
    const tools = agentTools[id];
    const meta = officeState.subagentMeta.get(id);
    const subTools = meta ? subagentTools[meta.parentAgentId]?.[meta.parentToolId] : undefined;
    const hasPermission =
      subHasPermission ||
      tools?.some((t) => t.permissionWait && !t.done) ||
      subTools?.some((t) => t.permissionWait && !t.done);
    const hasActiveTools = tools?.some((t) => !t.done) || subTools?.some((t) => !t.done);
    const isActive = ch.isActive;

    let dotColor: string | null = null;
    if (hasPermission) {
      dotColor = 'var(--color-status-permission)';
    } else if (isActive && hasActiveTools) {
      dotColor = 'var(--color-status-active)';
    }

    // Team info
    const isTeamAgent = !!ch.teamName;
    const teamRoleLabel = ch.isTeamLead ? 'LEAD' : ch.agentName || null;
    const aliasLabel = !isSub ? ch.aliasName : undefined;
    const totalTokens = ch.inputTokens + ch.outputTokens;
    const tokenRatio = totalTokens / MAX_CONTEXT_TOKENS;
    const hasExtraLines = !!(aliasLabel || ch.folderName || teamRoleLabel);
    const compact = alwaysShowOverlay && !isSelected && !isHovered;

    overlayItems.push({
      id,
      agentNumber: agentNumbers.get(id) ?? id.toString(),
      ch,
      isSelected,
      isHovered,
      isSub,
      compact,
      dense: compact && denseCompact,
      activityText,
      dotColor,
      aliasLabel,
      teamRoleLabel,
      folderName: ch.folderName,
      isTeamAgent,
      totalTokens,
      tokenRatio,
      screenX,
      screenY,
      width: compact
        ? denseCompact
          ? DENSE_OVERLAY_WIDTH_PX
          : COMPACT_OVERLAY_WIDTH_PX
        : FULL_OVERLAY_WIDTH_PX,
      height: compact ? 32 : hasExtraLines ? 82 : 56,
      left: 0,
      top: 0,
    });
  }

  const placedItems = placeOverlayItems(overlayItems, rect.width, rect.height);

  return (
    <>
      {placedItems.map((item) => {
        if (item.compact) {
          return (
            <div
              key={item.id}
              className="absolute pixel-panel px-6 py-3 flex items-center gap-4 overflow-hidden"
              style={{
                left: item.left,
                top: item.top,
                width: item.width,
                height: item.height,
                pointerEvents: 'none',
                opacity: item.isSub ? 0.58 : 0.78,
                zIndex: 39,
              }}
            >
              {item.dotColor && (
                <span
                  className={`w-5 h-5 rounded-full shrink-0 ${item.ch.isActive && !item.activityText.toLowerCase().includes('approval') ? 'pixel-pulse' : ''}`}
                  style={{ background: item.dotColor }}
                />
              )}
              <span
                className="shrink-0 w-18 h-18 flex items-center justify-center bg-bg-dark border-2 border-border text-2xs leading-none"
                title={`Agent ${item.agentNumber}`}
              >
                {item.agentNumber}
              </span>
              <span
                className="text-2xs leading-none truncate"
                title={getCompactLabel(item)}
                style={{ fontStyle: item.isSub ? 'italic' : undefined }}
              >
                {getCompactLabel(item)}
              </span>
            </div>
          );
        }

        return (
          <div
            key={item.id}
            className="absolute flex flex-col items-center"
            style={{
              left: item.left,
              top: item.top,
              width: item.width,
              pointerEvents: item.isSelected ? 'auto' : 'none',
              zIndex: item.isSelected ? 42 : 41,
            }}
          >
            <div className="flex items-center border-border px-8 pt-2 pb-4 gap-5 pixel-panel whitespace-nowrap w-full">
              {item.dotColor && (
                <span
                  className={`w-6 h-6 rounded-full shrink-0 ${item.ch.isActive && !item.activityText.toLowerCase().includes('approval') ? 'pixel-pulse' : ''}`}
                  style={{ background: item.dotColor }}
                />
              )}
              <span
                className="shrink-0 w-22 h-22 flex items-center justify-center bg-bg-dark border-2 border-border text-2xs leading-none"
                title={`Agent ${item.agentNumber}`}
              >
                {item.agentNumber}
              </span>
              <div className="flex flex-col gap-0 overflow-hidden min-w-0">
                {item.aliasLabel && (
                  <span
                    className="overflow-hidden text-ellipsis block leading-none text-accent-bright"
                    style={{ fontSize: '18px' }}
                  >
                    {item.aliasLabel}
                  </span>
                )}
                {item.teamRoleLabel && (
                  <span
                    className="overflow-hidden text-ellipsis block leading-none"
                    style={{
                      fontSize: '18px',
                      color: item.ch.isTeamLead ? TEAM_LEAD_COLOR : TEAM_ROLE_COLOR,
                      fontWeight: item.ch.isTeamLead ? 'bold' : undefined,
                    }}
                  >
                    {item.teamRoleLabel}
                  </span>
                )}
                <span
                  className="overflow-hidden text-ellipsis block leading-none"
                  style={{
                    fontSize: item.isSub ? '20px' : '22px',
                    fontStyle: item.isSub ? 'italic' : undefined,
                  }}
                  title={item.activityText}
                >
                  {item.activityText}
                </span>
                {item.folderName && (
                  <span
                    className="text-2xs leading-none overflow-hidden text-ellipsis block"
                    title={item.folderName}
                  >
                    {item.folderName}
                  </span>
                )}
              </div>
              {item.isSelected && !item.isSub && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseAgent(item.id);
                  }}
                  title="Close agent"
                  className="ml-2 shrink-0 leading-none"
                >
                  ×
                </Button>
              )}
            </div>
            {item.isTeamAgent && item.totalTokens > 0 && (
              <div
                style={{
                  width: FUEL_GAUGE_WIDTH_PX,
                  height: FUEL_GAUGE_HEIGHT_PX,
                  background: FUEL_GAUGE_BG,
                  marginTop: 2,
                }}
                title={`${Math.round(item.tokenRatio * 100)}% context used (${(item.totalTokens / 1000).toFixed(0)}k tokens)`}
              >
                <div
                  style={{
                    width: `${Math.min(item.tokenRatio * 100, 100)}%`,
                    height: '100%',
                    background: getFuelColor(item.tokenRatio),
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
