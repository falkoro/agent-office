import { type AgentAliases, getAgentActivity, getAgentAliasKey } from '../agentDisplay.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { ToolActivity } from '../office/types.js';
import { Button } from './ui/Button.js';

interface AgentDetailDrawerProps {
  officeState: OfficeState;
  agentId: number | null;
  agentTools: Record<number, ToolActivity[]>;
  agentStatuses: Record<number, string>;
  aliases: AgentAliases;
  onAliasChange: (agentId: number, alias: string) => void;
  onClose: () => void;
  onFocusAgent: (agentId: number) => void;
}

function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

export function AgentDetailDrawer({
  officeState,
  agentId,
  agentTools,
  agentStatuses,
  aliases,
  onAliasChange,
  onClose,
  onFocusAgent,
}: AgentDetailDrawerProps) {
  if (agentId === null) return null;

  const ch = officeState.characters.get(agentId);
  if (!ch) return null;

  const tools = agentTools[agentId] ?? [];
  const aliasKey = getAgentAliasKey(ch, agentId);
  const alias = aliases[aliasKey] ?? ch.aliasName ?? '';
  const activity = getAgentActivity(tools, ch, agentStatuses[agentId]);
  const status = agentStatuses[agentId] ?? (ch.isActive ? 'active' : 'idle');
  const totalTokens = ch.inputTokens + ch.outputTokens;

  return (
    <aside className="absolute top-70 right-10 bottom-80 z-30 w-320 max-w-[calc(100vw_-_20px)] pixel-panel p-10 overflow-y-auto">
      <div className="flex items-start justify-between gap-8 mb-10">
        <div className="min-w-0">
          <div className="text-lg leading-none truncate">{alias || ch.folderName || 'Agent'}</div>
          <div className="text-2xs text-text-muted leading-none mt-3">Agent {agentId}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title="Close details">
          ×
        </Button>
      </div>

      <label className="block text-2xs text-text-muted mb-3" htmlFor="agent-alias">
        Friendly name
      </label>
      <input
        id="agent-alias"
        value={alias}
        onChange={(event) => onAliasChange(agentId, event.target.value)}
        placeholder={ch.folderName || `Agent ${agentId.toString()}`}
        className="w-full bg-bg-dark border-2 border-border text-text text-sm px-6 py-4 outline-none mb-10"
      />

      <div className="grid grid-cols-[92px_1fr] gap-x-8 gap-y-6 text-sm">
        <span className="text-text-muted">Status</span>
        <span>{status}</span>
        <span className="text-text-muted">Activity</span>
        <span className="truncate" title={activity}>
          {activity}
        </span>
        <span className="text-text-muted">Seat</span>
        <span>{ch.seatId ?? 'none'}</span>
        <span className="text-text-muted">Workspace</span>
        <span className="truncate" title={ch.folderName}>
          {ch.folderName ?? 'unknown'}
        </span>
        {ch.teamName && (
          <>
            <span className="text-text-muted">Team</span>
            <span>{ch.teamName}</span>
          </>
        )}
        {totalTokens > 0 && (
          <>
            <span className="text-text-muted">Tokens</span>
            <span>
              {formatTokens(ch.inputTokens)} in / {formatTokens(ch.outputTokens)} out
            </span>
          </>
        )}
      </div>

      <div className="mt-12">
        <Button onClick={() => onFocusAgent(agentId)} className="w-full">
          Focus Agent
        </Button>
      </div>

      {tools.length > 0 && (
        <div className="mt-12">
          <div className="text-2xs text-text-muted mb-4">Recent activity</div>
          <div className="flex flex-col gap-4">
            {tools
              .slice(-5)
              .reverse()
              .map((tool) => (
                <div
                  key={tool.toolId}
                  className="bg-bg-dark border-2 border-border px-6 py-4 text-2xs"
                  title={tool.status}
                >
                  <div className="truncate">{tool.status}</div>
                  <div className="text-text-muted">
                    {tool.permissionWait ? 'needs approval' : tool.done ? 'done' : 'running'}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </aside>
  );
}
