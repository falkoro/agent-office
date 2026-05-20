import { useEffect, useState } from 'react';

import { Modal } from './ui/Modal.js';

interface ServicePanelProps {
  isOpen: boolean;
  onClose: () => void;
  agentCount: number;
}

interface HealthResponse {
  status: string;
  pid: number;
  uptime: number;
  agents: number;
}

function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return `${seconds.toString()}s`;
  if (minutes < 60) return `${minutes.toString()}m ${Math.floor(seconds % 60).toString()}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours.toString()}h ${(minutes % 60).toString()}m`;
}

function CommandBlock({ children }: { children: string }) {
  return (
    <pre className="bg-bg-dark border-2 border-border text-2xs leading-[1.35] p-6 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export function ServicePanel({ isOpen, onClose, agentCount }: ServicePanelProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error(`HTTP ${response.status.toString()}`);
        const data = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setHealth(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof Error ? err.message : 'Health check failed');
        }
      }
    };

    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Service & Setup"
      className="w-[min(860px,calc(100vw_-_32px))] max-h-[calc(100vh_-_48px)] overflow-y-auto"
      zIndex={54}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-8 pb-8">
        <section className="pixel-panel p-8">
          <div className="text-base mb-6">Health</div>
          <div className="grid grid-cols-[96px_1fr] gap-x-8 gap-y-5 text-sm">
            <span className="text-text-muted">Status</span>
            <span>{health?.status ?? (error ? 'offline' : 'checking')}</span>
            <span className="text-text-muted">PID</span>
            <span>{health?.pid ?? '-'}</span>
            <span className="text-text-muted">Uptime</span>
            <span>{health ? formatUptime(health.uptime) : '-'}</span>
            <span className="text-text-muted">Agents</span>
            <span>{health?.agents ?? agentCount}</span>
            <span className="text-text-muted">URL</span>
            <span className="truncate" title={window.location.origin}>
              {window.location.origin}
            </span>
          </div>
          {error && <div className="mt-6 text-2xs text-warning">Health check: {error}</div>}
        </section>

        <section className="pixel-panel p-8">
          <div className="text-base mb-6">Setup Wizard</div>
          <div className="text-sm text-text-muted mb-6">
            Use the service runner for the environment you want watching local agents.
          </div>
          <div className="flex flex-col gap-8">
            <div>
              <div className="text-sm mb-3">WSL / systemd</div>
              <CommandBlock>{`bun install
cd webview-ui && bun install && cd ..
bun run build
bun run install:wsl-service`}</CommandBlock>
            </div>
            <div>
              <div className="text-sm mb-3">Windows / Task Scheduler</div>
              <CommandBlock>{`bun install
cd webview-ui
bun install
cd ..
bun run build
bun run install:windows-service`}</CommandBlock>
            </div>
          </div>
        </section>

        <section className="md:col-span-2 pixel-panel p-8">
          <div className="text-base mb-6">Quick Checks</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="bg-bg-dark border-2 border-border p-6">
              <div className="text-text-muted text-2xs mb-3">WSL status</div>
              <CommandBlock>sudo systemctl status agent-office-wsl</CommandBlock>
            </div>
            <div className="bg-bg-dark border-2 border-border p-6">
              <div className="text-text-muted text-2xs mb-3">Windows status</div>
              <CommandBlock>Get-ScheduledTask AgentOfficeDashboard</CommandBlock>
            </div>
            <div className="bg-bg-dark border-2 border-border p-6">
              <div className="text-text-muted text-2xs mb-3">Open dashboard</div>
              <CommandBlock>http://localhost:4627</CommandBlock>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
