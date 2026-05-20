import type { SubagentCharacter } from './hooks/useExtensionMessages.js';

export function getAgentNumbers(
  agents: number[],
  subagentCharacters: SubagentCharacter[],
): Map<number, string> {
  const numbers = new Map<number, string>();
  agents.forEach((id, index) => numbers.set(id, (index + 1).toString()));

  const subagentCountsByParent = new Map<number, number>();
  for (const sub of subagentCharacters) {
    const parentNumber = numbers.get(sub.parentAgentId) ?? sub.parentAgentId.toString();
    const nextCount = (subagentCountsByParent.get(sub.parentAgentId) ?? 0) + 1;
    subagentCountsByParent.set(sub.parentAgentId, nextCount);
    numbers.set(sub.id, `${parentNumber}.${nextCount.toString()}`);
  }

  return numbers;
}
