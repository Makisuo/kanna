import { useEffect, useRef, useState } from "react"
import { ArrowDown, Flower, X } from "lucide-react"
import { ChatInput } from "../components/chat-ui/ChatInput"
import { ChatNavbar } from "../components/chat-ui/ChatNavbar"
import { ProcessingMessage } from "../components/messages/ProcessingMessage"
import { Card, CardContent } from "../components/ui/card"
import { ScrollArea } from "../components/ui/scroll-area"
import { cn } from "../lib/utils"
import { KannaTranscript } from "./KannaTranscript"
import { useStickyChatFocus } from "./useStickyChatFocus"
import { useChatPanelState } from "./useChatPanelState"
import type { KannaSocket } from "./socket"
import { Button } from "../components/ui/button"

const EMPTY_STATE_TEXT = "What are we building?"
const EMPTY_STATE_TYPING_INTERVAL_MS = 19
const CHAT_NAVBAR_OFFSET_PX = 72
const SCROLL_BUTTON_BOTTOM_PX = 120

export interface ChatPanelGlobalState {
  sidebarCollapsed: boolean
  openSidebar: () => void
  expandSidebar: () => void
  handleCompose: () => void
  handleOpenExternal: (action: "open_finder" | "open_terminal" | "open_editor") => Promise<void>
  editorLabel: string
  hasSelectedProject: boolean
}

interface ChatPanelProps {
  chatId: string | null
  socket: KannaSocket
  globalState: ChatPanelGlobalState
  isFocused: boolean
  onFocus: () => void
  onClose?: () => void
  showNavbarToolbar?: boolean
  navbarLocalPath?: string
  embeddedTerminalVisible?: boolean
  onToggleEmbeddedTerminal?: () => void
  rightSidebarVisible?: boolean
  onToggleRightSidebar?: () => void
  finderShortcut?: string[]
  editorShortcut?: string[]
  terminalShortcut?: string[]
  rightSidebarShortcut?: string[]
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>
}

export function ChatPanel({
  chatId,
  socket,
  globalState,
  isFocused,
  onFocus,
  onClose,
  showNavbarToolbar = true,
  navbarLocalPath,
  embeddedTerminalVisible,
  onToggleEmbeddedTerminal,
  rightSidebarVisible,
  onToggleRightSidebar,
  finderShortcut,
  editorShortcut,
  terminalShortcut,
  rightSidebarShortcut,
  chatInputRef: externalChatInputRef,
}: ChatPanelProps) {
  const panel = useChatPanelState(socket, chatId)
  const chatCardRef = useRef<HTMLDivElement>(null)
  const internalChatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatInputRef = externalChatInputRef ?? internalChatInputRef
  const [typedEmptyStateText, setTypedEmptyStateText] = useState("")
  const [isEmptyStateTypingComplete, setIsEmptyStateTypingComplete] = useState(false)

  useStickyChatFocus({
    rootRef: chatCardRef,
    fallbackRef: chatInputRef,
    enabled: isFocused && globalState.hasSelectedProject && panel.runtime?.status !== "waiting_for_user",
    canCancel: panel.canCancel,
  })

  useEffect(() => {
    if (panel.messages.length !== 0) return

    setTypedEmptyStateText("")
    setIsEmptyStateTypingComplete(false)

    let characterIndex = 0
    const interval = window.setInterval(() => {
      characterIndex += 1
      setTypedEmptyStateText(EMPTY_STATE_TEXT.slice(0, characterIndex))

      if (characterIndex >= EMPTY_STATE_TEXT.length) {
        window.clearInterval(interval)
        setIsEmptyStateTypingComplete(true)
      }
    }, EMPTY_STATE_TYPING_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [chatId, panel.messages.length])

  useEffect(() => {
    if (panel.messages.length === 0) return

    const frameId = window.requestAnimationFrame(() => {
      const element = panel.scrollRef.current
      if (!element) return
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [panel.messages.length, panel.scrollRef])

  useEffect(() => {
    function handleResize() {
      panel.updateScrollState()
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [panel.updateScrollState])

  const localPath = navbarLocalPath ?? panel.runtime?.localPath

  return (
    <Card
      ref={chatCardRef}
      className={cn(
        "bg-background h-full flex flex-col overflow-hidden border-0 rounded-none relative",
        onClose && isFocused && "ring-1 ring-inset ring-border"
      )}
      onPointerDown={onFocus}
    >
      <CardContent className="flex flex-1 min-h-0 flex-col p-0 overflow-hidden relative">
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <ChatNavbar
              sidebarCollapsed={globalState.sidebarCollapsed}
              onOpenSidebar={globalState.openSidebar}
              onExpandSidebar={globalState.expandSidebar}
              onNewChat={globalState.handleCompose}
              localPath={showNavbarToolbar ? localPath : undefined}
              embeddedTerminalVisible={embeddedTerminalVisible}
              onToggleEmbeddedTerminal={showNavbarToolbar ? onToggleEmbeddedTerminal : undefined}
              rightSidebarVisible={rightSidebarVisible}
              onToggleRightSidebar={showNavbarToolbar ? onToggleRightSidebar : undefined}
              onOpenExternal={showNavbarToolbar ? (action) => {
                void globalState.handleOpenExternal(action)
              } : undefined}
              editorLabel={globalState.editorLabel}
              finderShortcut={finderShortcut}
              editorShortcut={editorShortcut}
              terminalShortcut={terminalShortcut}
              rightSidebarShortcut={rightSidebarShortcut}
            />
          </div>
          {onClose ? (
            <div className="absolute top-2 right-2 z-20">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                title="Close split panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <ScrollArea
          ref={panel.scrollRef}
          onScroll={panel.updateScrollState}
          className="flex-1 min-h-0 px-4 scroll-pt-[72px]"
        >
          {panel.messages.length === 0 ? <div style={{ height: panel.transcriptPaddingBottom }} aria-hidden="true" /> : null}
          {panel.messages.length > 0 ? (
            <>
              <div className="animate-fade-in space-y-5 pt-[72px] max-w-[800px] mx-auto">
                <KannaTranscript
                  messages={panel.messages}
                  isLoading={panel.isProcessing}
                  localPath={panel.runtime?.localPath}
                  latestToolIds={panel.latestToolIds}
                  onOpenLocalLink={panel.handleOpenLocalLink}
                  onAskUserQuestionSubmit={panel.handleAskUserQuestion}
                  onExitPlanModeConfirm={panel.handleExitPlanMode}
                />
                {panel.isProcessing ? <ProcessingMessage status={panel.runtime?.status} /> : null}
                {panel.commandError ? (
                  <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded-xl px-4 py-3">
                    {panel.commandError}
                  </div>
                ) : null}
              </div>
              <div style={{ height: 250 }} aria-hidden="true" />
            </>
          ) : null}
        </ScrollArea>

        {panel.messages.length === 0 ? (
          <div
            key={chatId ?? "new-chat"}
            className="pointer-events-none absolute inset-x-4 animate-fade-in"
            style={{
              top: CHAT_NAVBAR_OFFSET_PX,
              bottom: panel.transcriptPaddingBottom,
            }}
          >
            <div className="mx-auto flex h-full max-w-[800px] items-center justify-center">
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-70">
                <Flower strokeWidth={1.5} className="size-8 text-muted-foreground kanna-empty-state-flower" />
                <div
                  className="text-base font-normal text-muted-foreground text-center max-w-xs flex items-center kanna-empty-state-text"
                  aria-label={EMPTY_STATE_TEXT}
                >
                  <span className="relative inline-grid place-items-start">
                    <span className="invisible col-start-1 row-start-1 whitespace-pre flex items-center">
                      <span>{EMPTY_STATE_TEXT}</span>
                      <span className="kanna-typewriter-cursor-slot" aria-hidden="true" />
                    </span>
                    <span className="col-start-1 row-start-1 whitespace-pre flex items-center">
                      <span>{typedEmptyStateText}</span>
                      <span className="kanna-typewriter-cursor-slot" aria-hidden="true">
                        <span
                          className="kanna-typewriter-cursor"
                          data-typing-complete={isEmptyStateTypingComplete ? "true" : "false"}
                        />
                      </span>
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div
          style={{ bottom: SCROLL_BUTTON_BOTTOM_PX }}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-10 transition-all",
            panel.showScrollButton
              ? "scale-100 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              : "scale-60 duration-300 ease-out pointer-events-none blur-sm opacity-0"
          )}
        >
          <button
            onClick={panel.scrollToBottom}
            className="flex items-center transition-colors gap-1.5 px-2 bg-white hover:bg-muted border border-border rounded-full aspect-square cursor-pointer text-sm text-primary hover:text-foreground dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 dark:border-slate-600"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>
      </CardContent>

      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
        <div className="bg-gradient-to-t from-background via-background pointer-events-auto" ref={panel.inputRef}>
          <ChatInput
            ref={chatInputRef}
            key={chatId ?? "new-chat"}
            onSubmit={panel.handleSend}
            onCancel={() => {
              void panel.handleCancel()
            }}
            disabled={!globalState.hasSelectedProject || panel.runtime?.status === "waiting_for_user"}
            canCancel={panel.canCancel}
            chatId={chatId}
            activeProvider={panel.runtime?.provider ?? null}
            availableProviders={panel.availableProviders}
          />
        </div>
      </div>
    </Card>
  )
}
