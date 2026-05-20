import { useState } from 'react';

import {
  type AgentAliases,
  getAgentDisplayName,
  getApprovalItems,
  getProviderName,
} from '../agentDisplay.js';
import { getAgentNumbers } from '../agentNumbers.js';
import type { SubagentCharacter } from '../hooks/useExtensionMessages.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { Button } from './ui/Button.js';

interface ApprovalInboxProps {
  officeState: OfficeState;
  agents: number[];
  agentTools: Record<number, ToolActivity[]>;
  subagentTools: Record<number, Record<string, ToolActivity[]>>;
  subagentCharacters: SubagentCharacter[];
  aliases: AgentAliases;
  onSelectAgent: (agentId: number) => void;
}

export function ApprovalInbox({
  officeState,
  agents,
  agentTools,
  subagentTools,
  subagentCharacters,
  aliases,
  onSelectAgent,
}: ApprovalInboxProps) {
  const [open, setOpen] = useState(false);
  const approvals = getApprovalItems(
    officeState,
    agentTools,
    aliases,
    subagentTools,
    subagentCharacters,
  );
  const numbers = getAgentNumbers(agents, subagentCharacters);
  const counts = new Map<string, number>();
  for (const id of agents) {
    const provider = getProviderName(officeState.characters.get(id));
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }

  return (
    <div className="absolute top-8 right-8 z-30 flex flex-col items-end gap-4">
      <div className="pixel-panel p-3 flex items-center gap-4">
        {[...counts].map(([provider, count]) => (
          <button
            key={provider}
            className="bg-bg-dark border-2 border-border text-text text-2xs px-4 py-2 cursor-default"
            title={`${count.toString()} ${provider} agent${count === 1 ? '' : 's'}`}
          >
            {provider} {count}
          </button>
        ))}
        <Button
          variant={approvals.length > 0 ? 'accent' : 'default'}
          size="sm"
          onClick={() => setOpen((value) => !value)}
          title="Approval inbox"
          aria-label={`${approvals.length.toString()} approvals`}
          className="h-28 min-w-44 flex items-center justify-center gap-3 px-4"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 8C5 5.2 7 3 10 3C13 3 15 5.2 15 8V12L17 15H3L5 12V8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M8 17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{approvals.length}</span>
        </Button>
      </div>

      {open && (
        <div className="pixel-panel w-270 max-w-[calc(100vw_-_20px)] p-6">
          <div className="flex items-center justify-between gap-6 mb-6">
            <div className="text-base leading-none">Approval Inbox</div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              ×
            </Button>
          </div>
          {approvals.length === 0 ? (
            <div className="text-sm text-text-muted">No agents need approval.</div>
          ) : (
            <div className="flex flex-col gap-5">
              {approvals.map((item) => (
                <button
                  key={`${item.id.toString()}:${item.toolId}`}
                  className="text-left bg-bg-dark border-2 border-border hover:bg-btn-hover text-text px-6 py-4 cursor-pointer"
                  onClick={() => {
                    onSelectAgent(item.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="shrink-0 w-20 h-20 flex items-center justify-center bg-bg border-2 border-border text-2xs leading-none">
                      {numbers.get(item.id) ?? item.id}
                    </span>
                    <span className="text-sm truncate">{item.label}</span>
                  </div>
                  {item.isSubagent && (
                    <div className="text-2xs text-text-muted truncate">
                      Subagent of{' '}
                      {getAgentDisplayName(officeState, item.parentAgentId ?? item.id, aliases)}
                    </div>
                  )}
                  <div className="text-2xs text-warning truncate">{item.status}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
