import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { URL } from 'url';

type ProviderId = 'codex' | 'claude' | 'opencode';

interface ProcessInfo {
  pid: number;
  ppid: number;
  comm: string;
  args: string[];
  cwd: string;
  cpuTicks: number;
  startedSecondsAgo: number;
}

interface AgentRecord {
  id: number;
  key: string;
  pid: number;
  provider: ProviderId;
  cwd: string;
  label: string;
  cpuTicks: number;
  lastActiveAt: number;
  lastToolId: string | null;
  lastStatus: 'active' | 'waiting';
  lastActivityText: string;
  sequence: number;
}

interface ProviderActivity {
  provider: ProviderId;
  text: string;
  file?: string;
  mtimeMs: number;
  changed: boolean;
}

type WebviewMessage = Record<string, unknown>;

const HOST = process.env.PIXEL_AGENTS_HOST || '0.0.0.0';
const PORT = Number(process.env.PIXEL_AGENTS_PORT || '4627');
const POLL_INTERVAL_MS = Number(process.env.PIXEL_AGENTS_POLL_INTERVAL_MS || '1500');
const ACTIVE_GRACE_MS = Number(process.env.PIXEL_AGENTS_ACTIVE_GRACE_MS || '7000');
const webRoot = path.resolve(process.env.PIXEL_AGENTS_WEB_ROOT || path.join('dist', 'webview'));

const providerLabels: Record<ProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  opencode: 'OpenCode',
};

const agents = new Map<string, AgentRecord>();
const clients = new Set<http.ServerResponse>();
const providerActivities = new Map<ProviderId, ProviderActivity>();
const providerFileMtimes = new Map<ProviderId, number>();
let nextAgentId = 1;

const startedAt = Date.now();

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    console.error('[Pixel Agents Standalone] request failed:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('internal server error');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[Pixel Agents Standalone] listening on http://${HOST}:${PORT}`);
  console.log(`[Pixel Agents Standalone] serving ${webRoot}`);
  scanAndBroadcast();
  setInterval(scanAndBroadcast, POLL_INTERVAL_MS);
});

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, {
      status: 'ok',
      pid: process.pid,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      agents: agents.size,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/agents') {
    sendJson(res, {
      agents: [...agents.values()].map(toAgentSummary),
      providerActivities: [...providerActivities.values()],
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    handleEvents(res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/client-message') {
    const body = await readBody(req, 128 * 1024);
    handleClientMessage(body);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  serveStatic(url.pathname, req, res);
}

function handleEvents(res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  clients.add(res);

  sendToClient(res, {
    type: 'settingsLoaded',
    soundEnabled: false,
    watchAllSessions: true,
    alwaysShowLabels: true,
    hooksEnabled: false,
    hooksInfoShown: true,
    extensionVersion: 'standalone',
    lastSeenVersion: 'standalone',
    externalAssetDirectories: [],
  });

  for (const agent of agents.values()) {
    sendAgentCreated(res, agent);
    sendAgentTeamInfo(res, agent);
    sendAgentActivity(res, agent, agent.lastActivityText, agent.lastStatus, true);
  }

  res.on('close', () => {
    clients.delete(res);
  });
}

function scanAndBroadcast(): void {
  const now = Date.now();
  const processes = listAgentProcesses();
  updateProviderActivities();

  const seenKeys = new Set<string>();
  for (const proc of processes) {
    const provider = identifyProvider(proc);
    if (!provider) continue;

    const key = `${provider}:${proc.pid}`;
    seenKeys.add(key);
    const label = buildAgentLabel(provider, proc);
    let agent = agents.get(key);

    if (!agent) {
      agent = {
        id: nextAgentId++,
        key,
        pid: proc.pid,
        provider,
        cwd: proc.cwd,
        label,
        cpuTicks: proc.cpuTicks,
        lastActiveAt: now,
        lastToolId: null,
        lastStatus: 'active',
        lastActivityText: `${providerLabels[provider]}: detected`,
        sequence: 0,
      };
      agents.set(key, agent);
      broadcastAgentCreated(agent);
      broadcastAgentTeamInfo(agent);
    }

    const activity = providerActivities.get(provider);
    const cpuChanged = proc.cpuTicks !== agent.cpuTicks;
    const providerChanged = activity?.changed ?? false;
    const providerRecentlyTouched =
      activity !== undefined && activity.mtimeMs > 0 && now - activity.mtimeMs <= ACTIVE_GRACE_MS;

    if (cpuChanged || providerChanged || providerRecentlyTouched) {
      agent.lastActiveAt = now;
    }

    agent.cpuTicks = proc.cpuTicks;
    agent.cwd = proc.cwd;
    agent.label = label;

    const isActive = now - agent.lastActiveAt <= ACTIVE_GRACE_MS;
    const status: 'active' | 'waiting' = isActive ? 'active' : 'waiting';
    const activityText = isActive
      ? (activity?.text ?? `${providerLabels[provider]}: working`)
      : `${providerLabels[provider]}: waiting`;

    if (status !== agent.lastStatus || activityText !== agent.lastActivityText) {
      sendAgentActivityToAll(agent, activityText, status);
    }
  }

  for (const [key, agent] of [...agents.entries()]) {
    if (!seenKeys.has(key)) {
      agents.delete(key);
      broadcast({ type: 'agentClosed', id: agent.id });
    }
  }
}

function listAgentProcesses(): ProcessInfo[] {
  if (process.platform === 'win32') {
    return listWindowsAgentProcesses();
  }
  return listLinuxAgentProcesses();
}

function listLinuxAgentProcesses(): ProcessInfo[] {
  const procDir = '/proc';
  let entries: string[];
  try {
    entries = fs.readdirSync(procDir);
  } catch {
    return [];
  }

  const processes: ProcessInfo[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    const base = path.join(procDir, entry);
    const comm = readText(path.join(base, 'comm')).trim();
    const cmdline = readBuffer(path.join(base, 'cmdline'));
    const args = cmdline ? cmdline.toString('utf-8').split('\0').filter(Boolean) : [];
    if (!comm && args.length === 0) continue;

    const stat = readProcStat(path.join(base, 'stat'));
    if (!stat) continue;

    const cwd = safeReadlink(path.join(base, 'cwd')) || os.homedir();
    const processInfo = {
      pid,
      ppid: stat.ppid,
      comm,
      args,
      cwd,
      cpuTicks: stat.utime + stat.stime,
      startedSecondsAgo: stat.startedSecondsAgo,
    };

    if (identifyProvider(processInfo)) {
      processes.push(processInfo);
    }
  }

  return processes.sort((a, b) => a.pid - b.pid);
}

function listWindowsAgentProcesses(): ProcessInfo[] {
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$items = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(codex|claude|opencode)(\\.exe)?$' -or $_.CommandLine -match 'opencode|codex|claude' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath",
    '$items | ConvertTo-Json -Compress',
  ].join('; ');

  let parsed: unknown;
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000,
    }).trim();
    if (!output) return [];
    parsed = JSON.parse(output);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const pid = Number(item.ProcessId || 0);
      const ppid = Number(item.ParentProcessId || 0);
      const name = String(item.Name || '');
      const commandLine = String(item.CommandLine || item.ExecutablePath || name);
      const args = splitWindowsCommandLine(commandLine);
      return {
        pid,
        ppid,
        comm: path.basename(name, '.exe'),
        args,
        cwd: os.homedir(),
        cpuTicks: getWindowsProcessCpuTicks(pid),
        startedSecondsAgo: 0,
      };
    })
    .filter((proc) => proc.pid > 0 && identifyProvider(proc))
    .sort((a, b) => a.pid - b.pid);
}

function identifyProvider(proc: ProcessInfo): ProviderId | null {
  const arg0 = path.basename(proc.args[0] || '').toLowerCase();
  const command = [proc.comm, arg0, proc.args.join(' ')].join(' ').toLowerCase();

  if (proc.comm === 'codex' || arg0 === 'codex') return 'codex';
  if (proc.comm === 'claude' || arg0 === 'claude') return 'claude';
  if (command.includes('opencode')) return 'opencode';

  return null;
}

function buildAgentLabel(provider: ProviderId, proc: ProcessInfo): string {
  const cwdName = proc.cwd === os.homedir() ? '~' : path.basename(proc.cwd);
  return `${providerLabels[provider]} ${proc.pid} · ${cwdName}`;
}

function updateProviderActivities(): void {
  const nextActivities: ProviderActivity[] = [
    getCodexActivity(),
    getClaudeActivity(),
    getOpenCodeActivity(),
  ];

  for (const activity of nextActivities) {
    const previous = providerFileMtimes.get(activity.provider) ?? 0;
    activity.changed = activity.mtimeMs > previous;
    providerFileMtimes.set(activity.provider, activity.mtimeMs);
    providerActivities.set(activity.provider, activity);
  }
}

function getCodexActivity(): ProviderActivity {
  const file = path.join(os.homedir(), '.codex', 'log', 'codex-tui.log');
  const mtimeMs = getMtimeMs(file);
  const tail = readTail(file, 128 * 1024);
  const toolMatches = [...tail.matchAll(/ToolCall:\s+([a-zA-Z0-9_.-]+)/g)];
  const lastTool = toolMatches.at(-1)?.[1];
  const text = lastTool ? `Codex: ${prettifyTool(lastTool)}` : 'Codex: working';
  return { provider: 'codex', text, file, mtimeMs, changed: false };
}

function getClaudeActivity(): ProviderActivity {
  const file = newestFile(path.join(os.homedir(), '.claude', 'projects'), '.jsonl');
  const mtimeMs = file ? getMtimeMs(file) : 0;
  const text = file ? `Claude: ${readClaudeTool(file)}` : 'Claude: working';
  return { provider: 'claude', text, file, mtimeMs, changed: false };
}

function getOpenCodeActivity(): ProviderActivity {
  const file =
    newestFile(path.join(os.homedir(), '.local', 'share', 'opencode', 'storage'), '.json') ??
    newestFile(path.join(process.env.LOCALAPPDATA || '', 'opencode', 'storage'), '.json');
  const mtimeMs = file ? getMtimeMs(file) : 0;
  const text = file ? `OpenCode: ${readOpenCodeHint(file)}` : 'OpenCode: working';
  return { provider: 'opencode', text, file, mtimeMs, changed: false };
}

function splitWindowsCommandLine(commandLine: string): string[] {
  const matches = commandLine.match(/"([^"]+)"|[^\s]+/g) ?? [];
  return matches.map((arg) => arg.replace(/^"|"$/g, ''));
}

function getWindowsProcessCpuTicks(pid: number): number {
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-Process -Id ${pid.toString()} -ErrorAction SilentlyContinue).TotalProcessorTime.Ticks`,
      ],
      { encoding: 'utf-8', windowsHide: true, timeout: 2000 },
    ).trim();
    return Number(output || 0);
  } catch {
    return 0;
  }
}

function readClaudeTool(file: string): string {
  const tail = readTail(file, 128 * 1024);
  const lines = tail.trim().split('\n').slice(-80).reverse();
  for (const line of lines) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const message = record.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (!item || typeof item !== 'object') continue;
        const maybeTool = item as Record<string, unknown>;
        if (maybeTool.type === 'tool_use' && typeof maybeTool.name === 'string') {
          return prettifyTool(maybeTool.name);
        }
      }
    } catch {
      // Ignore partial JSONL lines in tails.
    }
  }
  return 'working';
}

function readOpenCodeHint(file: string): string {
  const raw = readTail(file, 64 * 1024);
  if (/"tool"/i.test(raw) || /"part":\s*"tool"/i.test(raw)) return 'tool use';
  if (/"diff"/i.test(raw) || /"patch"/i.test(raw)) return 'editing';
  return 'working';
}

function prettifyTool(name: string): string {
  return name
    .replace(/^functions\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sendAgentActivityToAll(
  agent: AgentRecord,
  activityText: string,
  status: 'active' | 'waiting',
): void {
  sendAgentActivity(null, agent, activityText, status, false);
}

function sendAgentActivity(
  target: http.ServerResponse | null,
  agent: AgentRecord,
  activityText: string,
  status: 'active' | 'waiting',
  force: boolean,
): void {
  if (!force && status === agent.lastStatus && activityText === agent.lastActivityText) return;

  if (agent.lastToolId) {
    send(target, { type: 'agentToolDone', id: agent.id, toolId: agent.lastToolId });
  }

  agent.sequence += 1;
  const toolId = `${agent.provider}-${agent.pid}-${agent.sequence}`;
  agent.lastToolId = toolId;
  agent.lastStatus = status;
  agent.lastActivityText = activityText;

  send(target, {
    type: 'agentToolStart',
    id: agent.id,
    toolId,
    toolName: activityText,
    status: activityText,
  });
  send(target, { type: 'agentStatus', id: agent.id, status });
}

function broadcastAgentCreated(agent: AgentRecord): void {
  send(null, createAgentCreatedMessage(agent));
}

function sendAgentCreated(target: http.ServerResponse, agent: AgentRecord): void {
  sendToClient(target, createAgentCreatedMessage(agent));
}

function createAgentCreatedMessage(agent: AgentRecord): WebviewMessage {
  return {
    type: 'agentCreated',
    id: agent.id,
    folderName: agent.label,
  };
}

function broadcastAgentTeamInfo(agent: AgentRecord): void {
  send(null, createAgentTeamInfoMessage(agent));
}

function sendAgentTeamInfo(target: http.ServerResponse, agent: AgentRecord): void {
  sendToClient(target, createAgentTeamInfoMessage(agent));
}

function createAgentTeamInfoMessage(agent: AgentRecord): WebviewMessage {
  return {
    type: 'agentTeamInfo',
    id: agent.id,
    teamName: 'WSL',
    agentName: providerLabels[agent.provider],
    isTeamLead: false,
  };
}

function send(target: http.ServerResponse | null, message: WebviewMessage): void {
  if (target) {
    sendToClient(target, message);
  } else {
    broadcast(message);
  }
}

function broadcast(message: WebviewMessage): void {
  for (const client of clients) {
    sendToClient(client, message);
  }
}

function sendToClient(client: http.ServerResponse, message: WebviewMessage): void {
  client.write(`data: ${JSON.stringify(message)}\n\n`);
}

function serveStatic(
  rawPathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const pathname = decodeURIComponent(rawPathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = path.resolve(webRoot, relativePath);

  if (!candidate.startsWith(webRoot + path.sep) && candidate !== webRoot) {
    res.writeHead(403);
    res.end();
    return;
  }

  const filePath =
    fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
      ? path.join(candidate, 'index.html')
      : candidate;

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const indexPath = path.join(webRoot, 'index.html');
    if (fs.existsSync(indexPath)) {
      sendFile(indexPath, req, res);
      return;
    }
    res.writeHead(404);
    res.end('not found');
    return;
  }

  sendFile(filePath, req, res);
}

function sendFile(filePath: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Content-Length': stat.size,
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    default:
      return 'application/octet-stream';
  }
}

function sendJson(res: http.ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf-8');
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function handleClientMessage(body: string): void {
  try {
    const message = JSON.parse(body) as WebviewMessage;
    if (message.type === 'webviewReady') return;
    if (message.type === 'saveLayout' && message.layout) {
      const dir = path.join(os.homedir(), '.pixel-agents-wsl');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(message.layout, null, 2));
      return;
    }
    console.log('[Pixel Agents Standalone] client message:', JSON.stringify(message));
  } catch {
    console.warn('[Pixel Agents Standalone] ignored invalid client message');
  }
}

function toAgentSummary(agent: AgentRecord): Record<string, unknown> {
  return {
    id: agent.id,
    provider: agent.provider,
    pid: agent.pid,
    cwd: agent.cwd,
    label: agent.label,
    status: agent.lastStatus,
    activity: agent.lastActivityText,
  };
}

function readProcStat(
  filePath: string,
): { ppid: number; utime: number; stime: number; startedSecondsAgo: number } | null {
  const raw = readText(filePath);
  if (!raw) return null;
  const closeParen = raw.lastIndexOf(')');
  if (closeParen === -1) return null;
  const fields = raw.slice(closeParen + 2).split(' ');
  const ppid = Number(fields[1] || 0);
  const utime = Number(fields[11] || 0);
  const stime = Number(fields[12] || 0);
  const starttime = Number(fields[19] || 0);
  const uptimeSeconds = Number(readText('/proc/uptime').split(' ')[0] || 0);
  const clockTicks = 100;
  const startedSecondsAgo = Math.max(0, Math.floor(uptimeSeconds - starttime / clockTicks));
  return { ppid, utime, stime, startedSecondsAgo };
}

function newestFile(root: string, suffix: string): string | undefined {
  let best: { file: string; mtimeMs: number } | undefined;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(suffix)) continue;
      const mtimeMs = getMtimeMs(fullPath);
      if (!best || mtimeMs > best.mtimeMs) {
        best = { file: fullPath, mtimeMs };
      }
    }
  }
  return best?.file;
}

function getMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function readTail(filePath: string, maxBytes: number): string {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      return buffer.toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readBuffer(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function safeReadlink(filePath: string): string | null {
  try {
    return fs.readlinkSync(filePath);
  } catch {
    return null;
  }
}
