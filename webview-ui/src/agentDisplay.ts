import type { SubagentCharacter } from './hooks/useExtensionMessages.js';
import type { OfficeState } from './office/engine/officeState.js';
import type { Character, ToolActivity } from './office/types.js';

export type AgentAliases = Record<string, string>;

export interface ApprovalItem {
  id: number;
  label: string;
  status: string;
  toolId: string;
  parentAgentId?: number;
  isSubagent?: boolean;
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

export function getSubagentDisplayName(
  officeState: OfficeState,
  id: number,
  aliases: AgentAliases,
  subagentCharacters: SubagentCharacter[],
): string {
  const ch = officeState.characters.get(id);
  if (!ch?.isSubagent) return getAgentDisplayName(officeState, id, aliases);

  const meta = officeState.subagentMeta.get(id);
  const sub = subagentCharacters.find((item) => item.id === id);
  const label = sub?.label || 'Subagent';
  if (!meta) return label;

  const parentName = getAgentDisplayName(officeState, meta.parentAgentId, aliases);
  return `${parentName} / ${label}`;
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
  subagentTools: Record<number, Record<string, ToolActivity[]>> = {},
  subagentCharacters: SubagentCharacter[] = [],
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
  for (const [rawParentId, toolsByParentTool] of Object.entries(subagentTools)) {
    const parentAgentId = Number(rawParentId);
    for (const [parentToolId, tools] of Object.entries(toolsByParentTool)) {
      const subId =
        officeState.getSubagentId(parentAgentId, parentToolId) ??
        subagentCharacters.find(
          (sub) => sub.parentAgentId === parentAgentId && sub.parentToolId === parentToolId,
        )?.id ??
        parentAgentId;
      for (const tool of tools) {
        if (!tool.permissionWait || tool.done) continue;
        items.push({
          id: subId,
          label: getSubagentDisplayName(officeState, subId, aliases, subagentCharacters),
          status: tool.status,
          toolId: `${parentToolId}:${tool.toolId}`,
          parentAgentId,
          isSubagent: subId !== parentAgentId,
        });
      }
    }
  }
  return items;
}

export function getProviderName(ch: Character | undefined): string {
  if (!ch?.folderName) return 'Agent';
  const match = ch.folderName.match(/^([A-Za-z]+)\s+\d+\s+·/);
  return match?.[1] ?? 'Agent';
}
