import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AgentAliases,
  cleanActivityText,
  getAgentActivity,
  getAgentDisplayName,
  getProviderName,
  getSubagentDisplayName,
  hasPermissionWait,
} from '../agentDisplay.js';
import { getAgentNumbers } from '../agentNumbers.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import type { SubagentCharacter } from './useExtensionMessages.js';

export type AgentEventTone = 'active' | 'waiting' | 'approval' | 'info';

export interface AgentEvent {
  id: string;
  agentId: number;
  agentNumber: string;
  label: string;
  activity: string;
  tone: AgentEventTone;
  timestamp: number;
  isSubagent: boolean;
}

interface Snapshot {
  id: number;
  label: string;
  activity: string;
  tone: AgentEventTone;
  key: string;
  isSubagent: boolean;
}

interface UseAgentTimelineArgs {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  aliases: AgentAliases;
}

function latestToolKey(tools: ToolActivity[] | undefined): string {
  const latest = tools?.at(-1);
  if (!latest) return 'none';
  return `${latest.toolId}:${latest.status}:${latest.done ? 'done' : 'run'}:${latest.permissionWait ? 'approval' : 'ok'}`;
}

function toneFromStatus(
  tools: ToolActivity[] | undefined,
  fallbackStatus: string | undefined,
  isActive: boolean,
): AgentEventTone {
  if (hasPermissionWait(tools)) return 'approval';
  if (fallbackStatus === 'waiting' || !isActive) return 'waiting';
  return 'active';
}

function buildSnapshots({
  officeState,
  agents,
  agentTools,
  agentStatuses,
  subagentTools,
  subagentCharacters,
  aliases,
}: UseAgentTimelineArgs): Snapshot[] {
  const snapshots: Snapshot[] = [];

  for (const id of agents) {
    const ch = officeState.characters.get(id);
    const tools = agentTools[id] ?? [];
    const label = getAgentDisplayName(officeState, id, aliases);
    const activity = getAgentActivity(tools, ch, agentStatuses[id]);
    const tone = toneFromStatus(tools, agentStatuses[id], ch?.isActive ?? false);
    snapshots.push({
      id,
      label,
      activity,
      tone,
      key: `${tone}:${activity}:${latestToolKey(tools)}`,
      isSubagent: false,
    });
  }

  for (const sub of subagentCharacters) {
    const ch = officeState.characters.get(sub.id);
    const tools = subagentTools[sub.parentAgentId]?.[sub.parentToolId] ?? [];
    const provider = getProviderName(officeState.characters.get(sub.parentAgentId));
    const activeTool = [...tools].reverse().find((tool) => !tool.done);
    const activity = hasPermissionWait(tools)
      ? 'Needs approval'
      : activeTool
        ? cleanActivityText(activeTool.status, provider)
        : sub.label || 'Subtask';
    const label = getSubagentDisplayName(officeState, sub.id, aliases, subagentCharacters);
    const tone = toneFromStatus(tools, undefined, ch?.isActive ?? false);
    snapshots.push({
      id: sub.id,
      label,
      activity,
      tone,
      key: `${tone}:${activity}:${latestToolKey(tools)}`,
      isSubagent: true,
    });
  }

  return snapshots;
}

export function useAgentTimeline(args: UseAgentTimelineArgs): {
  events: AgentEvent[];
  getHistoryForAgent: (agentId: number) => AgentEvent[];
} {
  const {
    officeState,
    agents,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    aliases,
  } = args;
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const previousRef = useRef<Map<number, Snapshot>>(new Map());
  const eventSeqRef = useRef(0);

  useEffect(() => {
    const numbers = getAgentNumbers(agents, subagentCharacters);
    const snapshots = buildSnapshots({
      officeState,
      agents,
      agentTools,
      agentStatuses,
      subagentTools,
      subagentCharacters,
      aliases,
    });
    const previous = previousRef.current;
    const incoming: AgentEvent[] = [];
    const now = Date.now();

    for (const snapshot of snapshots) {
      const prior = previous.get(snapshot.id);
      if (prior?.key === snapshot.key) continue;
      if (!prior && previous.size > 0) {
        // Existing agents are noisy on first page load; new arrivals after that are useful.
        incoming.push({
          id: `event-${now.toString()}-${(eventSeqRef.current++).toString()}`,
          agentId: snapshot.id,
          agentNumber: numbers.get(snapshot.id) ?? snapshot.id.toString(),
          label: snapshot.label,
          activity: 'detected',
          tone: 'info',
          timestamp: now,
          isSubagent: snapshot.isSubagent,
        });
      }
      if (prior) {
        incoming.push({
          id: `event-${now.toString()}-${(eventSeqRef.current++).toString()}`,
          agentId: snapshot.id,
          agentNumber: numbers.get(snapshot.id) ?? snapshot.id.toString(),
          label: snapshot.label,
          activity: snapshot.activity,
          tone: snapshot.tone,
          timestamp: now,
          isSubagent: snapshot.isSubagent,
        });
      }
    }

    previousRef.current = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    if (incoming.length > 0) {
      setEvents((prev) => [...incoming.reverse(), ...prev].slice(0, 120));
    }
  }, [officeState, agents, agentTools, agentStatuses, subagentTools, subagentCharacters, aliases]);

  const getHistoryForAgent = useCallback(
    (agentId: number) => events.filter((event) => event.agentId === agentId).slice(0, 8),
    [events],
  );

  return { events, getHistoryForAgent };
}
