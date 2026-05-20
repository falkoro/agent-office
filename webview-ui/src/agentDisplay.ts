import type { OfficeState } from './office/engine/officeState.js';
import type { Character, ToolActivity } from './office/types.js';

export type AgentAliases = Record<string, string>;

export interface ApprovalItem {
  id: number;
  label: string;
  status: string;
  toolId: string;
}

export function getAgentAliasKey(ch: Character | undefined, id: number): string {
  if (!ch) return `agent:${id.toString()}`;
  if (ch.folderName) return `label:${ch.folderName}`;
  if (ch.teamName || ch.agentName) return `team:${ch.teamName ?? 'team'}:${ch.agentName ?? id}`;
  return `agent:${id.toString()}`;
}

export function getBaseAgentName(ch: Character | undefined, id: number): string {
  if (!ch) return `Agent ${id.toString()}`;
  if (ch.aliasName) return ch.aliasName;
  if (ch.agentName) return ch.agentName;
  if (ch.folderName) return ch.folderName;
  return `Agent ${id.toString()}`;
}

export function getAgentDisplayName(
  officeState: OfficeState,
  id: number,
  aliases: AgentAliases,
): string {
  const ch = officeState.characters.get(id);
  const alias = aliases[getAgentAliasKey(ch, id)];
  if (alias) return alias;
  return getBaseAgentName(ch, id);
}

export function getAgentActivity(
  tools: ToolActivity[] | undefined,
  ch: Character | undefined,
  fallbackStatus?: string,
): string {
  const active = tools ? [...tools].reverse().find((tool) => !tool.done) : undefined;
  if (active?.permissionWait) return 'Needs approval';
  if (active) return active.status;
  if (tools && tools.length > 0 && ch?.isActive) return tools[tools.length - 1].status;
  if (fallbackStatus) return fallbackStatus;
  return ch?.isActive ? 'Working' : 'Idle';
}

export function hasPermissionWait(tools: ToolActivity[] | undefined): boolean {
  return !!tools?.some((tool) => tool.permissionWait && !tool.done);
}

export function getApprovalItems(
  officeState: OfficeState,
  agentTools: Record<number, ToolActivity[]>,
  aliases: AgentAliases,
): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  for (const [rawId, tools] of Object.entries(agentTools)) {
    const id = Number(rawId);
    for (const tool of tools) {
      if (!tool.permissionWait || tool.done) continue;
      items.push({
        id,
        label: getAgentDisplayName(officeState, id, aliases),
        status: tool.status,
        toolId: tool.toolId,
      });
    }
  }
  return items;
}

export function getProviderName(ch: Character | undefined): string {
  if (!ch?.folderName) return 'Agent';
  const match = ch.folderName.match(/^([A-Za-z]+)\s+\d+\s+·/);
  return match?.[1] ?? 'Agent';
}
