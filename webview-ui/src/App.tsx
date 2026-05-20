import { useCallback, useEffect, useRef, useState } from 'react';

import { type AgentAliases, getAgentAliasKey } from './agentDisplay.js';
import { toMajorMinor } from './changelogData.js';
import { AgentDetailDrawer } from './components/AgentDetailDrawer.js';
import { ApprovalInbox } from './components/ApprovalInbox.js';
import { BottomToolbar } from './components/BottomToolbar.js';
import { ChangelogModal } from './components/ChangelogModal.js';
import { DebugView } from './components/DebugView.js';
import { EditActionBar } from './components/EditActionBar.js';
import { MigrationNotice } from './components/MigrationNotice.js';
import { SettingsModal } from './components/SettingsModal.js';
import { Tooltip } from './components/Tooltip.js';
import { Modal } from './components/ui/Modal.js';
import { VersionIndicator } from './components/VersionIndicator.js';
import { ZoomControls } from './components/ZoomControls.js';
import { ZOOM_MAX, ZOOM_MIN } from './constants.js';
import { useEditorActions } from './hooks/useEditorActions.js';
import { useEditorKeyboard } from './hooks/useEditorKeyboard.js';
import { useExtensionMessages } from './hooks/useExtensionMessages.js';
import { OfficeCanvas } from './office/components/OfficeCanvas.js';
import { ToolOverlay } from './office/components/ToolOverlay.js';
import { EditorState } from './office/editor/editorState.js';
import { EditorToolbar } from './office/editor/EditorToolbar.js';
import { OfficeState } from './office/engine/officeState.js';
import { getCatalogEntry, isRotatable } from './office/layout/furnitureCatalog.js';
import { EditTool, type OfficeLayout, TILE_SIZE, TileType } from './office/types.js';
import { isBrowserRuntime } from './runtime.js';
import { vscode } from './vscodeApi.js';

// Game state lives outside React — updated imperatively by message handlers
const officeStateRef = { current: null as OfficeState | null };
const editorState = new EditorState();
const ALIASES_STORAGE_KEY = 'agent-office.aliases.v1';

function getOfficeState(): OfficeState {
  if (!officeStateRef.current) {
    officeStateRef.current = new OfficeState();
  }
  return officeStateRef.current;
}

function readAgentAliases(): AgentAliases {
  try {
    const raw = localStorage.getItem(ALIASES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as AgentAliases;
  } catch {
    return {};
  }
}

function writeAgentAliases(aliases: AgentAliases): void {
  try {
    localStorage.setItem(ALIASES_STORAGE_KEY, JSON.stringify(aliases));
  } catch {
    // Browser storage can be unavailable in hardened contexts.
  }
}

function getLayoutContentBounds(layout: OfficeLayout): {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
} {
  let minCol = layout.cols;
  let minRow = layout.rows;
  let maxCol = -1;
  let maxRow = -1;

  const includeTile = (col: number, row: number) => {
    minCol = Math.min(minCol, col);
    minRow = Math.min(minRow, row);
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  };

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (layout.tiles[row * layout.cols + col] !== TileType.VOID) {
        includeTile(col, row);
      }
    }
  }

  for (const item of layout.furniture) {
    const entry = getCatalogEntry(item.type);
    const width = entry?.footprintW ?? 1;
    const height = entry?.footprintH ?? 1;
    includeTile(item.col, item.row);
    includeTile(item.col + width - 1, item.row + height - 1);
  }

  if (maxCol < minCol || maxRow < minRow) {
    return {
      minCol: 0,
      minRow: 0,
      maxCol: Math.max(0, layout.cols - 1),
      maxRow: Math.max(0, layout.rows - 1),
    };
  }

  return { minCol, minRow, maxCol, maxRow };
}

function App() {
  // Browser runtime (dev or static dist): dispatch mock messages after the
  // useExtensionMessages listener has been registered.
  useEffect(() => {
    if (isBrowserRuntime) {
      void import('./browserMock.js').then(({ dispatchMockMessages }) => {
        dispatchMockMessages();
        void import('./standaloneClient.js').then(({ connectStandaloneEvents }) =>
          connectStandaloneEvents(),
        );
      });
    }
  }, []);

  const editor = useEditorActions(getOfficeState, editorState);

  const isEditDirty = useCallback(
    () => editor.isEditMode && editor.isDirty,
    [editor.isEditMode, editor.isDirty],
  );

  const {
    agents,
    selectedAgent,
    agentTools,
    agentStatuses,
    subagentTools,
    subagentCharacters,
    layoutReady,
    layoutWasReset,
    loadedAssets,
    workspaceFolders,
    externalAssetDirectories,
    lastSeenVersion,
    extensionVersion,
    watchAllSessions,
    setWatchAllSessions,
    alwaysShowLabels,
    hooksEnabled,
    setHooksEnabled,
    hooksInfoShown,
  } = useExtensionMessages(getOfficeState, editor.setLastSavedLayout, isEditDirty);

  // Show migration notice once layout reset is detected
  const [migrationNoticeDismissed, setMigrationNoticeDismissed] = useState(false);
  const showMigrationNotice = layoutWasReset && !migrationNoticeDismissed;

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHooksInfoOpen, setIsHooksInfoOpen] = useState(false);
  const [hooksTooltipDismissed, setHooksTooltipDismissed] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [alwaysShowOverlay, setAlwaysShowOverlay] = useState(false);
  const [selectedOfficeAgent, setSelectedOfficeAgent] = useState<number | null>(null);
  const [agentAliases, setAgentAliases] = useState<AgentAliases>(() => readAgentAliases());

  const currentMajorMinor = toMajorMinor(extensionVersion);

  const handleWhatsNewDismiss = useCallback(() => {
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  const handleOpenChangelog = useCallback(() => {
    setIsChangelogOpen(true);
    vscode.postMessage({ type: 'setLastSeenVersion', version: currentMajorMinor });
  }, [currentMajorMinor]);

  // Sync alwaysShowOverlay from persisted settings
  useEffect(() => {
    setAlwaysShowOverlay(alwaysShowLabels);
  }, [alwaysShowLabels]);

  const handleToggleDebugMode = useCallback(() => setIsDebugMode((prev) => !prev), []);
  const handleToggleAlwaysShowOverlay = useCallback(() => {
    setAlwaysShowOverlay((prev) => {
      const newVal = !prev;
      vscode.postMessage({ type: 'setAlwaysShowLabels', enabled: newVal });
      return newVal;
    });
  }, []);

  const needsApproval =
    Object.values(agentTools).some((tools) =>
      tools.some((tool) => tool.permissionWait && !tool.done),
    ) ||
    Object.values(subagentTools).some((toolsByParent) =>
      Object.values(toolsByParent).some((tools) =>
        tools.some((tool) => tool.permissionWait && !tool.done),
      ),
    );

  useEffect(() => {
    const countPrefix = agents.length > 0 ? `(${agents.length.toString()}) ` : '';
    const attentionPrefix = needsApproval ? '🔔 ' : '';
    document.title = `${attentionPrefix}${countPrefix}Agent Office`;
  }, [agents.length, needsApproval]);

  useEffect(() => {
    const os = getOfficeState();
    for (const id of agents) {
      const ch = os.characters.get(id);
      if (!ch) continue;
      os.setAgentAlias(id, agentAliases[getAgentAliasKey(ch, id)]);
    }
  }, [agents, agentAliases]);

  const handleSelectAgent = useCallback((id: number) => {
    const os = getOfficeState();
    os.selectedAgentId = id;
    os.cameraFollowId = id;
    setSelectedOfficeAgent(id);
    vscode.postMessage({ type: 'focusAgent', id });
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const didInitialFitRef = useRef(false);

  const [editorTickForKeyboard, setEditorTickForKeyboard] = useState(0);
  useEditorKeyboard(
    editor.isEditMode,
    editorState,
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    useCallback(() => setEditorTickForKeyboard((n) => n + 1), []),
    editor.handleToggleEditMode,
  );

  const handleCloseAgent = useCallback((id: number) => {
    vscode.postMessage({ type: 'closeAgent', id });
  }, []);

  const handleClick = useCallback((agentId: number) => {
    // If clicked agent is a sub-agent, focus the parent's terminal instead
    const os = getOfficeState();
    const meta = os.subagentMeta.get(agentId);
    const focusId = meta ? meta.parentAgentId : agentId;
    setSelectedOfficeAgent(agentId);
    vscode.postMessage({ type: 'focusAgent', id: focusId });
  }, []);

  const handleAgentSelectionChange = useCallback((agentId: number | null) => {
    setSelectedOfficeAgent(agentId);
  }, []);

  const handleAgentAliasChange = useCallback((agentId: number, alias: string) => {
    const os = getOfficeState();
    const ch = os.characters.get(agentId);
    const key = getAgentAliasKey(ch, agentId);
    const normalized = alias.trim();
    setAgentAliases((prev) => {
      const next = { ...prev };
      if (normalized) {
        next[key] = normalized;
      } else {
        delete next[key];
      }
      writeAgentAliases(next);
      return next;
    });
    os.setAgentAlias(agentId, normalized || undefined);
  }, []);

  const handleFitToPage = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const layout = getOfficeState().getLayout();
    const bounds = getLayoutContentBounds(layout);
    const boundsCols = bounds.maxCol - bounds.minCol + 1;
    const boundsRows = bounds.maxRow - bounds.minRow + 1;
    const dpr = window.devicePixelRatio || 1;
    const fitByWidth = Math.floor((rect.width * dpr * 0.96) / (boundsCols * TILE_SIZE));
    const fitByHeight = Math.floor((rect.height * dpr * 0.9) / (boundsRows * TILE_SIZE));
    const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitByWidth, fitByHeight));
    const layoutCenterX = (layout.cols * TILE_SIZE) / 2;
    const layoutCenterY = (layout.rows * TILE_SIZE) / 2;
    const boundsCenterX = ((bounds.minCol + bounds.maxCol + 1) * TILE_SIZE) / 2;
    const boundsCenterY = ((bounds.minRow + bounds.maxRow + 1) * TILE_SIZE) / 2;
    editor.handleZoomChange(nextZoom);
    editor.panRef.current = {
      x: Math.round((layoutCenterX - boundsCenterX) * nextZoom),
      y: Math.round((layoutCenterY - boundsCenterY) * nextZoom),
    };
    getOfficeState().cameraFollowId = null;
  }, [editor]);

  useEffect(() => {
    if (!layoutReady || didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    const frame = requestAnimationFrame(() => handleFitToPage());
    return () => cancelAnimationFrame(frame);
  }, [layoutReady, handleFitToPage]);

  const officeState = getOfficeState();

  // Force dependency on editorTickForKeyboard to propagate keyboard-triggered re-renders
  void editorTickForKeyboard;

  // Show "Press R to rotate" hint when a rotatable item is selected or being placed
  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item && isRotatable(item.type)) return true;
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        isRotatable(editorState.selectedFurnitureType)
      ) {
        return true;
      }
      return false;
    })();

  if (!layoutReady) {
    return <div className="w-full h-full flex items-center justify-center ">Loading...</div>;
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <OfficeCanvas
        officeState={officeState}
        onClick={handleClick}
        isEditMode={editor.isEditMode}
        editorState={editorState}
        onEditorTileAction={editor.handleEditorTileAction}
        onEditorEraseAction={editor.handleEditorEraseAction}
        onEditorSelectionChange={editor.handleEditorSelectionChange}
        onDeleteSelected={editor.handleDeleteSelected}
        onRotateSelected={editor.handleRotateSelected}
        onDragMove={editor.handleDragMove}
        editorTick={editor.editorTick}
        zoom={editor.zoom}
        onZoomChange={editor.handleZoomChange}
        panRef={editor.panRef}
        onAgentSelectionChange={handleAgentSelectionChange}
      />

      {!isDebugMode ? (
        <>
          <ZoomControls
            zoom={editor.zoom}
            onZoomChange={editor.handleZoomChange}
            onFitToPage={handleFitToPage}
          />

          <ApprovalInbox
            officeState={officeState}
            agents={agents}
            agentTools={agentTools}
            aliases={agentAliases}
            onSelectAgent={handleSelectAgent}
          />

          {/* Vignette overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'var(--vignette)' }}
          />

          {editor.isEditMode && editor.isDirty && (
            <EditActionBar editor={editor} editorState={editorState} />
          )}

          {showRotateHint && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-11 bg-accent-bright text-white text-sm py-3 px-8 rounded-none border-2 border-accent shadow-pixel pointer-events-none whitespace-nowrap"
              style={{ top: editor.isDirty ? 64 : 8 }}
            >
              Rotate (R)
            </div>
          )}

          {editor.isEditMode &&
            (() => {
              const selUid = editorState.selectedFurnitureUid;
              const selColor = selUid
                ? (officeState.getLayout().furniture.find((f) => f.uid === selUid)?.color ?? null)
                : null;
              return (
                <EditorToolbar
                  activeTool={editorState.activeTool}
                  selectedTileType={editorState.selectedTileType}
                  selectedFurnitureType={editorState.selectedFurnitureType}
                  selectedFurnitureUid={selUid}
                  selectedFurnitureColor={selColor}
                  floorColor={editorState.floorColor}
                  wallColor={editorState.wallColor}
                  selectedWallSet={editorState.selectedWallSet}
                  onToolChange={editor.handleToolChange}
                  onTileTypeChange={editor.handleTileTypeChange}
                  onFloorColorChange={editor.handleFloorColorChange}
                  onWallColorChange={editor.handleWallColorChange}
                  onWallSetChange={editor.handleWallSetChange}
                  onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
                  onFurnitureTypeChange={editor.handleFurnitureTypeChange}
                  loadedAssets={loadedAssets}
                />
              );
            })()}

          <ToolOverlay
            officeState={officeState}
            agents={agents}
            agentTools={agentTools}
            subagentCharacters={subagentCharacters}
            containerRef={containerRef}
            zoom={editor.zoom}
            panRef={editor.panRef}
            onCloseAgent={handleCloseAgent}
            alwaysShowOverlay={alwaysShowOverlay}
          />

          <AgentDetailDrawer
            officeState={officeState}
            agentId={selectedOfficeAgent}
            agentTools={agentTools}
            agentStatuses={agentStatuses}
            aliases={agentAliases}
            onAliasChange={handleAgentAliasChange}
            onClose={() => {
              officeState.selectedAgentId = null;
              officeState.cameraFollowId = null;
              setSelectedOfficeAgent(null);
            }}
            onFocusAgent={handleSelectAgent}
          />
        </>
      ) : (
        <DebugView
          agents={agents}
          selectedAgent={selectedAgent}
          agentTools={agentTools}
          agentStatuses={agentStatuses}
          subagentTools={subagentTools}
          onSelectAgent={handleSelectAgent}
        />
      )}

      {/* Hooks first-run tooltip */}
      {!hooksInfoShown && !hooksTooltipDismissed && (
        <Tooltip
          title="Instant Detection Active"
          position="top-right"
          onDismiss={() => {
            setHooksTooltipDismissed(true);
            vscode.postMessage({ type: 'setHooksInfoShown' });
          }}
        >
          <span className="text-sm text-text leading-none">
            Your agents now respond in real-time.{' '}
            <span
              className="text-accent cursor-pointer underline"
              onClick={() => {
                setIsHooksInfoOpen(true);
                setHooksTooltipDismissed(true);
                vscode.postMessage({ type: 'setHooksInfoShown' });
              }}
            >
              View more
            </span>
          </span>
        </Tooltip>
      )}

      {/* Hooks info modal */}
      <Modal
        isOpen={isHooksInfoOpen}
        onClose={() => setIsHooksInfoOpen(false)}
        title="Instant Detection is ON"
        zIndex={52}
      >
        <div className="text-base text-text px-10" style={{ lineHeight: 1.4 }}>
          <p className="mb-8">Your Pixel Agents office now reacts in real-time:</p>
          <ul className="mb-8 pl-18 list-disc m-0">
            <li className="text-sm mb-2">Permission prompts appear instantly</li>
            <li className="text-sm mb-2">Turn completions detected the moment they happen</li>
            <li className="text-sm mb-2">Sound notifications play immediately</li>
          </ul>
          <p className="mb-12 text-text-muted">
            This works through Claude Code Hooks, small event listeners that notify Pixel Agents
            whenever something happens in your Claude sessions.
          </p>
          <div className="text-center">
            <button
              onClick={() => setIsHooksInfoOpen(false)}
              className="py-4 px-20 text-lg bg-accent text-white border-2 border-accent rounded-none cursor-pointer shadow-pixel"
            >
              Got it
            </button>
          </div>
          <p className="mt-8 text-xs text-text-muted text-center">
            To disable, go to Settings {'>'} Instant Detection
          </p>
        </div>
      </Modal>

      <BottomToolbar
        isEditMode={editor.isEditMode}
        onOpenClaude={editor.handleOpenClaude}
        onToggleEditMode={editor.handleToggleEditMode}
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => setIsSettingsOpen((v) => !v)}
        workspaceFolders={workspaceFolders}
        canLaunchAgents={!isBrowserRuntime}
        agentCount={agents.length}
        needsAttention={needsApproval}
      />

      <VersionIndicator
        currentVersion={extensionVersion}
        lastSeenVersion={lastSeenVersion}
        onDismiss={handleWhatsNewDismiss}
        onOpenChangelog={handleOpenChangelog}
      />

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        currentVersion={extensionVersion}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDebugMode={isDebugMode}
        onToggleDebugMode={handleToggleDebugMode}
        alwaysShowOverlay={alwaysShowOverlay}
        onToggleAlwaysShowOverlay={handleToggleAlwaysShowOverlay}
        externalAssetDirectories={externalAssetDirectories}
        watchAllSessions={watchAllSessions}
        onToggleWatchAllSessions={() => {
          const newVal = !watchAllSessions;
          setWatchAllSessions(newVal);
          vscode.postMessage({ type: 'setWatchAllSessions', enabled: newVal });
        }}
        hooksEnabled={hooksEnabled}
        onToggleHooksEnabled={() => {
          const newVal = !hooksEnabled;
          setHooksEnabled(newVal);
          vscode.postMessage({ type: 'setHooksEnabled', enabled: newVal });
        }}
      />

      {showMigrationNotice && (
        <MigrationNotice onDismiss={() => setMigrationNoticeDismissed(true)} />
      )}
    </div>
  );
}

export default App;
