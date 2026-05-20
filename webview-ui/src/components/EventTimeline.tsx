import { useState } from 'react';

import type { AgentEvent, AgentEventTone } from '../hooks/useAgentTimeline.js';
import { Button } from './ui/Button.js';

interface EventTimelineProps {
  events: AgentEvent[];
  onSelectAgent: (agentId: number) => void;
}

function toneClass(tone: AgentEventTone): string {
  if (tone === 'approval') return 'bg-status-permission';
  if (tone === 'active') return 'bg-status-active';
  if (tone === 'waiting') return 'bg-text-muted';
  return 'bg-accent';
}

function formatTime(timestamp: number): string {
  const age = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (age < 60) return `${age.toString()}s`;
  const minutes = Math.floor(age / 60);
  if (minutes < 60) return `${minutes.toString()}m`;
  return `${Math.floor(minutes / 60).toString()}h`;
}

export function EventTimeline({ events, onSelectAgent }: EventTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);
  const visible = events.slice(0, 7);

  return (
    <aside className="absolute bottom-8 right-8 z-20 w-330 max-w-[calc(100vw_-_20px)] pixel-panel overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b-2 border-border">
        <div className="text-sm leading-none">Timeline</div>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '+' : '-'}
        </Button>
      </div>
      {!collapsed && (
        <div className="max-h-150 overflow-y-auto p-4 flex flex-col gap-3">
          {visible.length === 0 ? (
            <div className="text-2xs text-text-muted px-4 py-6">Waiting for agent activity.</div>
          ) : (
            visible.map((event) => (
              <button
                key={event.id}
                onClick={() => onSelectAgent(event.agentId)}
                className="bg-bg-dark border-2 border-border hover:bg-btn-hover text-left px-4 py-3 flex items-center gap-4 cursor-pointer"
                title={event.label}
              >
                <span className="shrink-0 w-20 h-20 flex items-center justify-center bg-bg border-2 border-border text-2xs leading-none">
                  {event.agentNumber}
                </span>
                <span className={`shrink-0 w-5 h-5 rounded-full ${toneClass(event.tone)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs leading-none truncate">
                    {event.label}: {event.activity}
                  </span>
                </span>
                <span className="text-2xs text-text-muted shrink-0">
                  {formatTime(event.timestamp)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
