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
    <aside className="absolute bottom-10 right-10 z-20 w-390 max-w-[calc(100vw_-_390px)] pixel-panel overflow-hidden">
      <div className="flex items-center justify-between gap-6 px-8 py-6 border-b-2 border-border">
        <div className="text-sm leading-none">Timeline</div>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '+' : '-'}
        </Button>
      </div>
      {!collapsed && (
        <div className="max-h-180 overflow-y-auto p-5 flex flex-col gap-4">
          {visible.length === 0 ? (
            <div className="text-2xs text-text-muted px-4 py-6">Waiting for agent activity.</div>
          ) : (
            visible.map((event) => (
              <button
                key={event.id}
                onClick={() => onSelectAgent(event.agentId)}
                className="bg-bg-dark border-2 border-border hover:bg-btn-hover text-left px-5 py-4 flex items-center gap-5 cursor-pointer"
                title={event.label}
              >
                <span className="shrink-0 w-24 h-24 flex items-center justify-center bg-bg border-2 border-border text-2xs leading-none">
                  {event.agentNumber}
                </span>
                <span className={`shrink-0 w-6 h-6 rounded-full ${toneClass(event.tone)}`} />
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
