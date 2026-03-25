import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useOutletContext } from "react-router-dom"
import { RightSidebar } from "../components/chat-ui/RightSidebar"
import { TerminalWorkspace } from "../components/chat-ui/TerminalWorkspace"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable"
import { actionMatchesEvent, getResolvedKeybindings } from "../lib/keybindings"
import { cn } from "../lib/utils"
import {
  DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT,
  RIGHT_SIDEBAR_MAX_SIZE_PERCENT,
  RIGHT_SIDEBAR_MIN_SIZE_PERCENT,
  useRightSidebarStore,
} from "../stores/rightSidebarStore"
import { DEFAULT_PROJECT_TERMINAL_LAYOUT, useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"
import { useSplitViewStore } from "../stores/splitViewStore"
import { TERMINAL_TOGGLE_ANIMATION_DURATION_MS } from "./terminalToggleAnimation"
import { useRightSidebarToggleAnimation } from "./useRightSidebarToggleAnimation"
import { useTerminalToggleAnimation } from "./useTerminalToggleAnimation"
import type { KeybindingsSnapshot } from "../../shared/types"
import type { KannaState } from "./useKannaState"
import type { KannaSocket } from "./socket"
import { ChatPanel, type ChatPanelGlobalState } from "./ChatPanel"

export function ChatPage() {
  const state = useOutletContext<KannaState>()
  const layoutRootRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const [fixedTerminalHeight, setFixedTerminalHeight] = useState(0)
  const projectId = state.runtime?.projectId ?? null
  const projectTerminalLayout = useTerminalLayoutStore((store) => (projectId ? store.projects[projectId] : undefined))
  const terminalLayout = projectTerminalLayout ?? DEFAULT_PROJECT_TERMINAL_LAYOUT
  const projectRightSidebarLayout = useRightSidebarStore((store) => (projectId ? store.projects[projectId] : undefined))
  const rightSidebarLayout = projectRightSidebarLayout ?? DEFAULT_PROJECT_RIGHT_SIDEBAR_LAYOUT
  const addTerminal = useTerminalLayoutStore((store) => store.addTerminal)
  const removeTerminal = useTerminalLayoutStore((store) => store.removeTerminal)
  const toggleVisibility = useTerminalLayoutStore((store) => store.toggleVisibility)
  const setMainSizes = useTerminalLayoutStore((store) => store.setMainSizes)
  const setTerminalSizes = useTerminalLayoutStore((store) => store.setTerminalSizes)
  const toggleRightSidebar = useRightSidebarStore((store) => store.toggleVisibility)
  const setRightSidebarSize = useRightSidebarStore((store) => store.setSize)
  const scrollback = useTerminalPreferencesStore((store) => store.scrollbackLines)
  const minColumnWidth = useTerminalPreferencesStore((store) => store.minColumnWidth)
  const keybindings = state.keybindings
  const resolvedKeybindings = useMemo(() => getResolvedKeybindings(keybindings), [keybindings])

  const projectSplit = useSplitViewStore((store) => projectId ? store.projects[projectId] : undefined)
  const splitPanels = projectSplit?.panels ?? []
  const focusedIndex = projectSplit?.focusedIndex ?? 0
  const setFocused = useSplitViewStore((store) => store.setFocused)
  const removePanel = useSplitViewStore((store) => store.removePanel)

  const hasTerminals = terminalLayout.terminals.length > 0
  const showTerminalPane = Boolean(projectId && terminalLayout.isVisible && hasTerminals)
  const shouldRenderTerminalLayout = Boolean(projectId && hasTerminals)
  const showRightSidebar = Boolean(projectId && rightSidebarLayout.isVisible)
  const shouldRenderRightSidebarLayout = Boolean(projectId)
  const {
    isAnimating: isTerminalAnimating,
    mainPanelGroupRef,
    terminalFocusRequestVersion,
    terminalPanelRef,
    terminalVisualRef,
  } = useTerminalToggleAnimation({
    showTerminalPane,
    shouldRenderTerminalLayout,
    projectId,
    terminalLayout,
    chatInputRef,
  })
  const {
    isAnimating: isRightSidebarAnimating,
    panelGroupRef: rightSidebarPanelGroupRef,
    sidebarPanelRef,
    sidebarVisualRef,
  } = useRightSidebarToggleAnimation({
    projectId,
    shouldRenderRightSidebarLayout,
    showRightSidebar,
    rightSidebarSize: rightSidebarLayout.size,
  })

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      if (!projectId) return
      if (actionMatchesEvent(resolvedKeybindings, "toggleEmbeddedTerminal", event)) {
        event.preventDefault()
        if (hasTerminals) {
          toggleVisibility(projectId)
          return
        }

        addTerminal(projectId)
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "toggleRightSidebar", event)) {
        event.preventDefault()
        toggleRightSidebar(projectId)
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "openInFinder", event)) {
        event.preventDefault()
        void state.handleOpenExternal("open_finder")
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "openInEditor", event)) {
        event.preventDefault()
        void state.handleOpenExternal("open_editor")
        return
      }

      if (actionMatchesEvent(resolvedKeybindings, "addSplitTerminal", event)) {
        event.preventDefault()
        addTerminal(projectId)
      }
    }

    window.addEventListener("keydown", handleGlobalKeydown)
    return () => window.removeEventListener("keydown", handleGlobalKeydown)
  }, [addTerminal, hasTerminals, projectId, resolvedKeybindings, toggleRightSidebar, toggleVisibility])

  useEffect(() => {
    const element = layoutRootRef.current
    if (!element || !shouldRenderTerminalLayout) return

    const updateHeight = () => {
      const containerHeight = element.getBoundingClientRect().height
      if (containerHeight <= 0) return
      const nextHeight = containerHeight * (terminalLayout.mainSizes[1] / 100)
      if (nextHeight <= 0) return
      setFixedTerminalHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight))
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    updateHeight()

    return () => observer.disconnect()
  }, [projectId, shouldRenderTerminalLayout, terminalLayout.mainSizes])

  const clampRightSidebarSize = (size: number) => {
    if (!Number.isFinite(size)) {
      return rightSidebarLayout.size
    }

    return Math.min(RIGHT_SIDEBAR_MAX_SIZE_PERCENT, Math.max(RIGHT_SIDEBAR_MIN_SIZE_PERCENT, size))
  }

  // Use a ref to hold the latest state values so the globalState object
  // has a stable identity and doesn't cause ChatPanel re-renders.
  const stateRef = useRef(state)
  stateRef.current = state

  const globalState: ChatPanelGlobalState = useMemo(() => ({
    get sidebarCollapsed() { return stateRef.current.sidebarCollapsed },
    openSidebar: () => stateRef.current.openSidebar(),
    expandSidebar: () => stateRef.current.expandSidebar(),
    handleCompose: () => stateRef.current.handleCompose(),
    handleOpenExternal: (action: "open_finder" | "open_terminal" | "open_editor") => stateRef.current.handleOpenExternal(action),
    get editorLabel() { return stateRef.current.editorLabel },
    get hasSelectedProject() { return stateRef.current.hasSelectedProject },
  }), []) // stable — reads from ref

  const hasSplitPanels = splitPanels.length > 0
  const allChatIds = useMemo(() => {
    const ids = [state.activeChatId]
    for (const panel of splitPanels) {
      ids.push(panel.chatId)
    }
    return ids
  }, [state.activeChatId, splitPanels])

  const onToggleEmbeddedTerminal = projectId
    ? () => {
        if (hasTerminals) {
          toggleVisibility(projectId)
          return
        }
        addTerminal(projectId)
      }
    : undefined

  const handleFocus = useCallback((index: number) => {
    if (projectId) setFocused(projectId, index)
  }, [projectId, setFocused])

  const handleClosePanel = useCallback((chatId: string) => {
    if (projectId) removePanel(projectId, chatId)
  }, [projectId, removePanel])

  const noopFocus = useCallback(() => {}, [])

  const chatContent = hasSplitPanels ? (
    <SplitChatPanels
      allChatIds={allChatIds}
      socket={state.socket}
      globalState={globalState}
      focusedIndex={focusedIndex}
      onFocus={handleFocus}
      onClose={handleClosePanel}
      navbarLocalPath={state.navbarLocalPath}
      showTerminalPane={showTerminalPane}
      onToggleEmbeddedTerminal={onToggleEmbeddedTerminal}
      showRightSidebar={showRightSidebar}
      onToggleRightSidebar={projectId ? () => toggleRightSidebar(projectId) : undefined}
      resolvedKeybindings={resolvedKeybindings}
      chatInputRef={chatInputRef}
    />
  ) : (
    <ChatPanel
      chatId={state.activeChatId}
      socket={state.socket}
      globalState={globalState}
      isFocused
      onFocus={noopFocus}
      navbarLocalPath={state.navbarLocalPath}
      embeddedTerminalVisible={showTerminalPane}
      onToggleEmbeddedTerminal={onToggleEmbeddedTerminal}
      rightSidebarVisible={showRightSidebar}
      onToggleRightSidebar={projectId ? () => toggleRightSidebar(projectId) : undefined}
      finderShortcut={resolvedKeybindings.bindings.openInFinder}
      editorShortcut={resolvedKeybindings.bindings.openInEditor}
      terminalShortcut={resolvedKeybindings.bindings.toggleEmbeddedTerminal}
      rightSidebarShortcut={resolvedKeybindings.bindings.toggleRightSidebar}
      chatInputRef={chatInputRef}
    />
  )

  return (
    <div ref={layoutRootRef} className="flex-1 flex flex-col min-w-0 relative">
      {shouldRenderRightSidebarLayout && projectId ? (
        <ResizablePanelGroup
          key={`${projectId}-right-sidebar`}
          groupRef={rightSidebarPanelGroupRef}
          orientation="horizontal"
          className="flex-1 min-h-0"
          onLayoutChange={(layout) => {
            if (!showRightSidebar || isRightSidebarAnimating.current) {
              return
            }

            const clampedRightSidebarSize = clampRightSidebarSize(layout.rightSidebar)
            if (Math.abs(clampedRightSidebarSize - layout.rightSidebar) < 0.1) {
              return
            }

            rightSidebarPanelGroupRef.current?.setLayout({
              workspace: 100 - clampedRightSidebarSize,
              rightSidebar: clampedRightSidebarSize,
            })
          }}
          onLayoutChanged={(layout) => {
            if (!showRightSidebar || isRightSidebarAnimating.current) {
              return
            }

            setRightSidebarSize(projectId, clampRightSidebarSize(layout.rightSidebar))
          }}
        >
          <ResizablePanel
            id="workspace"
            defaultSize={`${100 - rightSidebarLayout.size}%`}
            minSize="50%"
            className="min-h-0 min-w-0"
          >
            {shouldRenderTerminalLayout ? (
              <ResizablePanelGroup
                key={projectId}
                groupRef={mainPanelGroupRef}
                orientation="vertical"
                className="flex-1 min-h-0"
                onLayoutChanged={(layout) => {
                  if (!showTerminalPane || isTerminalAnimating.current) {
                    return
                  }
                  setMainSizes(projectId, [layout.chat, layout.terminal])
                }}
              >
                <ResizablePanel id="chat" defaultSize={`${terminalLayout.mainSizes[0]}%`} minSize="25%" className="min-h-0">
                  {chatContent}
                </ResizablePanel>
                <ResizableHandle
                  withHandle
                  orientation="vertical"
                  className={cn(!showTerminalPane && "pointer-events-none opacity-0")}
                />
                <ResizablePanel
                  id="terminal"
                  defaultSize={`${terminalLayout.mainSizes[1]}%`}
                  minSize="0%"
                  className="min-h-0"
                  elementRef={terminalPanelRef}
                >
                  <div
                    ref={terminalVisualRef}
                    className="h-full min-h-0 overflow-hidden relative"
                    data-terminal-open={showTerminalPane ? "true" : "false"}
                    data-terminal-animated="false"
                    data-terminal-visual
                    style={{
                      "--terminal-toggle-duration": `${TERMINAL_TOGGLE_ANIMATION_DURATION_MS}ms`,
                    } as CSSProperties}
                  >
                    <div style={fixedTerminalHeight > 0 ? { height: `${fixedTerminalHeight}px` } : undefined}>
                      <TerminalWorkspace
                        projectId={projectId}
                        layout={terminalLayout}
                        onAddTerminal={addTerminal}
                        socket={state.socket}
                        connectionStatus={state.connectionStatus}
                        scrollback={scrollback}
                        minColumnWidth={minColumnWidth}
                        splitTerminalShortcut={resolvedKeybindings.bindings.addSplitTerminal}
                        focusRequestVersion={terminalFocusRequestVersion}
                        onRemoveTerminal={(currentProjectId, terminalId) => {
                          void state.socket.command({ type: "terminal.close", terminalId }).catch(() => {})
                          removeTerminal(currentProjectId, terminalId)
                        }}
                        onTerminalLayout={setTerminalSizes}
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              chatContent
            )}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            orientation="horizontal"
            disabled={!showRightSidebar}
            className={cn(!showRightSidebar && "pointer-events-none opacity-0")}
          />
          <ResizablePanel
            id="rightSidebar"
            defaultSize={`${rightSidebarLayout.size}%`}
            maxSize={`${RIGHT_SIDEBAR_MAX_SIZE_PERCENT}%`}
            className="min-h-0 min-w-0"
            elementRef={sidebarPanelRef}
          >
            <div
              ref={sidebarVisualRef}
              className="h-full min-h-0 overflow-hidden"
              data-right-sidebar-open={showRightSidebar ? "true" : "false"}
              data-right-sidebar-animated="false"
              data-right-sidebar-visual
              style={{
                "--terminal-toggle-duration": `${TERMINAL_TOGGLE_ANIMATION_DURATION_MS}ms`,
              } as CSSProperties}
            >
              <RightSidebar
                onClose={() => toggleRightSidebar(projectId)}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : shouldRenderTerminalLayout && projectId ? (
        <ResizablePanelGroup
          key={projectId}
          groupRef={mainPanelGroupRef}
          orientation="vertical"
          className="flex-1 min-h-0"
          onLayoutChanged={(layout) => {
            if (!showTerminalPane || isTerminalAnimating.current) {
              return
            }
            setMainSizes(projectId, [layout.chat, layout.terminal])
          }}
        >
          <ResizablePanel id="chat" defaultSize={`${terminalLayout.mainSizes[0]}%`} minSize="25%" className="min-h-0">
            {chatContent}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            orientation="vertical"
            className={cn(!showTerminalPane && "pointer-events-none opacity-0")}
          />
          <ResizablePanel
            id="terminal"
            defaultSize={`${terminalLayout.mainSizes[1]}%`}
            minSize="0%"
            className="min-h-0"
            elementRef={terminalPanelRef}
          >
            <div
              ref={terminalVisualRef}
              className="h-full min-h-0 overflow-hidden relative"
              data-terminal-open={showTerminalPane ? "true" : "false"}
              data-terminal-animated="false"
              data-terminal-visual
              style={{
                "--terminal-toggle-duration": `${TERMINAL_TOGGLE_ANIMATION_DURATION_MS}ms`,
              } as CSSProperties}
            >
              <div style={fixedTerminalHeight > 0 ? { height: `${fixedTerminalHeight}px` } : undefined}>
                <TerminalWorkspace
                  projectId={projectId}
                  layout={terminalLayout}
                  onAddTerminal={addTerminal}
                  socket={state.socket}
                  connectionStatus={state.connectionStatus}
                  scrollback={scrollback}
                  minColumnWidth={minColumnWidth}
                  splitTerminalShortcut={resolvedKeybindings.bindings.addSplitTerminal}
                  focusRequestVersion={terminalFocusRequestVersion}
                  onRemoveTerminal={(currentProjectId, terminalId) => {
                    void state.socket.command({ type: "terminal.close", terminalId }).catch(() => {})
                    removeTerminal(currentProjectId, terminalId)
                  }}
                  onTerminalLayout={setTerminalSizes}
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        chatContent
      )}

    </div>
  )
}

// Separate component to stabilize per-panel callbacks and avoid re-mounting panels
interface SplitChatPanelsProps {
  allChatIds: (string | null)[]
  socket: KannaSocket
  globalState: ChatPanelGlobalState
  focusedIndex: number
  onFocus: (index: number) => void
  onClose: (chatId: string) => void
  navbarLocalPath?: string
  showTerminalPane: boolean
  onToggleEmbeddedTerminal?: () => void
  showRightSidebar: boolean
  onToggleRightSidebar?: () => void
  resolvedKeybindings: KeybindingsSnapshot
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>
}

function SplitChatPanels({
  allChatIds,
  socket,
  globalState,
  focusedIndex,
  onFocus,
  onClose,
  navbarLocalPath,
  showTerminalPane,
  onToggleEmbeddedTerminal,
  showRightSidebar,
  onToggleRightSidebar,
  resolvedKeybindings,
  chatInputRef,
}: SplitChatPanelsProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {allChatIds.map((cId, i) => (
        <Fragment key={cId ?? `panel-${i}`}>
          {i > 0 && <ResizableHandle orientation="horizontal" className="!w-2 !mx-0 before:!w-0 cursor-col-resize" />}
          <ResizablePanel
            id={`split-${i}`}
            defaultSize={`${100 / allChatIds.length}%`}
            minSize="20%"
            className="min-h-0 min-w-0"
          >
            <SplitChatPanelSlot
              index={i}
              totalPanels={allChatIds.length}
              chatId={cId}
              socket={socket}
              globalState={globalState}
              isFocused={focusedIndex === i}
              onFocus={onFocus}
              onClose={i > 0 ? onClose : undefined}
              navbarLocalPath={i === 0 ? navbarLocalPath : undefined}
              showTerminalPane={i === 0 ? showTerminalPane : false}
              onToggleEmbeddedTerminal={i === 0 ? onToggleEmbeddedTerminal : undefined}
              showRightSidebar={i === 0 ? showRightSidebar : false}
              onToggleRightSidebar={i === 0 ? onToggleRightSidebar : undefined}
              resolvedKeybindings={i === 0 ? resolvedKeybindings : undefined}
              chatInputRef={i === 0 ? chatInputRef : undefined}
            />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  )
}

// Wraps ChatPanel with stable callbacks and spacing
interface SplitChatPanelSlotProps {
  index: number
  totalPanels: number
  chatId: string | null
  socket: KannaSocket
  globalState: ChatPanelGlobalState
  isFocused: boolean
  onFocus: (index: number) => void
  onClose?: (chatId: string) => void
  navbarLocalPath?: string
  showTerminalPane: boolean
  onToggleEmbeddedTerminal?: () => void
  showRightSidebar: boolean
  onToggleRightSidebar?: () => void
  resolvedKeybindings?: KeybindingsSnapshot
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>
}

function SplitChatPanelSlot({
  index,
  totalPanels,
  chatId,
  socket,
  globalState,
  isFocused,
  onFocus,
  onClose,
  navbarLocalPath,
  showTerminalPane,
  onToggleEmbeddedTerminal,
  showRightSidebar,
  onToggleRightSidebar,
  resolvedKeybindings,
  chatInputRef,
}: SplitChatPanelSlotProps) {
  const handleFocus = useCallback(() => onFocus(index), [onFocus, index])
  const handleClose = useCallback(() => {
    if (chatId && onClose) onClose(chatId)
  }, [onClose, chatId])

  const isFirst = index === 0

  return (
    <div className={cn(
      "h-full group/split-panel",
      "pt-2 pb-2",
    )}>
      <ChatPanel
        chatId={chatId}
        socket={socket}
        globalState={globalState}
        isFocused={isFocused}
        isSplitView
        onFocus={handleFocus}
        onClose={onClose ? handleClose : undefined}
        showNavbarToolbar={isFirst}
        navbarLocalPath={navbarLocalPath}
        embeddedTerminalVisible={showTerminalPane || undefined}
        onToggleEmbeddedTerminal={onToggleEmbeddedTerminal}
        rightSidebarVisible={showRightSidebar || undefined}
        onToggleRightSidebar={onToggleRightSidebar}
        finderShortcut={resolvedKeybindings?.bindings.openInFinder}
        editorShortcut={resolvedKeybindings?.bindings.openInEditor}
        terminalShortcut={resolvedKeybindings?.bindings.toggleEmbeddedTerminal}
        rightSidebarShortcut={resolvedKeybindings?.bindings.toggleRightSidebar}
        chatInputRef={chatInputRef}
      />
    </div>
  )
}
