import { useState } from 'react';

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
import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { Button } from './ui/Button.js';

interface AgentRosterProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  aliases: AgentAliases;
  selectedAgentId: number | null;
  onSelectAgent: (agentId: number) => void;
}

interface RosterItem {
  id: number;
  number: string;
  label: string;
  provider: string;
  activity: string;
  tone: 'active' | 'waiting' | 'approval';
  isSubagent: boolean;
}

function toneClass(tone: RosterItem['tone']): string {
  if (tone === 'approval') return 'bg-status-permission';
  if (tone === 'active') return 'bg-status-active';
  return 'bg-text-muted';
}

export function AgentRoster({
  officeState,
  agents,
  agentTools,
  agentStatuses,
  subagentTools,
  subagentCharacters,
  aliases,
  selectedAgentId,
  onSelectAgent,
}: AgentRosterProps) {
  const [collapsed, setCollapsed] = useState(false);
  const numbers = getAgentNumbers(agents, subagentCharacters);

  const items: RosterItem[] = agents.map((id) => {
    const ch = officeState.characters.get(id);
    const tools = agentTools[id] ?? [];
    const approval = hasPermissionWait(tools);
    const status = agentStatuses[id] ?? (ch?.isActive ? 'active' : 'waiting');
    return {
      id,
      number: numbers.get(id) ?? id.toString(),
      label: getAgentDisplayName(officeState, id, aliases),
      provider: getProviderName(ch),
      activity: getAgentActivity(tools, ch, agentStatuses[id]),
      tone: approval ? 'approval' : status === 'waiting' ? 'waiting' : 'active',
      isSubagent: false,
    };
  });

  for (const sub of subagentCharacters) {
    const ch = officeState.characters.get(sub.id);
    const tools = subagentTools[sub.parentAgentId]?.[sub.parentToolId] ?? [];
    const provider = getProviderName(officeState.characters.get(sub.parentAgentId));
    const active = [...tools].reverse().find((tool) => !tool.done);
    const approval = hasPermissionWait(tools);
    items.push({
      id: sub.id,
      number: numbers.get(sub.id) ?? sub.id.toString(),
      label: getSubagentDisplayName(officeState, sub.id, aliases, subagentCharacters),
      provider,
      activity: approval
        ? 'Needs approval'
        : active
          ? cleanActivityText(active.status, provider)
          : sub.label || 'Subtask',
      tone: approval ? 'approval' : ch?.isActive ? 'active' : 'waiting',
      isSubagent: true,
    });
  }

  return (
    <aside className="absolute top-76 right-8 z-20 w-282 max-w-[calc(100vw_-_20px)] pixel-panel overflow-hidden">
      <div className="flex items-center justify-between gap-6 px-8 py-6 border-b-2 border-border">
        <div className="text-sm leading-none">Roster</div>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '+' : '-'}
        </Button>
      </div>
      {!collapsed && (
        <div className="max-h-[38vh] overflow-y-auto p-5 flex flex-col gap-4">
          {items.length === 0 ? (
            <div className="text-2xs text-text-muted px-4 py-6">No agents detected.</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectAgent(item.id)}
                className={`bg-bg-dark border-2 text-left px-5 py-4 flex items-center gap-5 cursor-pointer hover:bg-btn-hover ${
                  selectedAgentId === item.id ? 'border-accent' : 'border-border'
                }`}
                title={item.label}
              >
                <span className="shrink-0 w-24 h-24 flex items-center justify-center bg-bg border-2 border-border text-2xs leading-none">
                  {item.number}
                </span>
                <span className={`shrink-0 w-6 h-6 rounded-full ${toneClass(item.tone)}`} />
                <span className="min-w-0 flex flex-col gap-1">
                  <span
                    className="text-2xs leading-none truncate"
                    style={{ fontStyle: item.isSubagent ? 'italic' : undefined }}
                  >
                    {item.label}
                  </span>
                  <span className="text-2xs text-text-muted leading-none truncate">
                    {item.provider} · {item.activity}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
