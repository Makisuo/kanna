import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  PROVIDERS,
  type AgentProvider,
  type AskUserQuestionAnswerMap,
  type ModelOptions,
  type ProviderCatalogEntry,
} from "../../shared/types"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import type { ChatSnapshot } from "../../shared/types"
import type { AskUserQuestionItem } from "../components/messages/types"
import { processTranscriptMessages } from "../lib/parseTranscript"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
import { type KannaSocket } from "./socket"
import { useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"

export function shouldPinTranscriptToBottom(distanceFromBottom: number) {
  return distanceFromBottom < 120
}

function getActiveChatSnapshot(chatSnapshot: ChatSnapshot | null, chatId: string | null): ChatSnapshot | null {
  if (!chatSnapshot) return null
  if (!chatId) return null
  if (chatSnapshot.runtime.chatId !== chatId) return null
  return chatSnapshot
}

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320

export interface ChatPanelState {
  chatId: string | null
  chatSnapshot: ChatSnapshot | null
  messages: ReturnType<typeof processTranscriptMessages>
  latestToolIds: ReturnType<typeof getLatestToolIds>
  runtime: ChatSnapshot["runtime"] | null
  availableProviders: ProviderCatalogEntry[]
  isProcessing: boolean
  canCancel: boolean
  commandError: string | null
  scrollRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLDivElement | null>
  transcriptPaddingBottom: number
  showScrollButton: boolean
  updateScrollState: () => void
  scrollToBottom: () => void
  handleSend: (
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<void>
  handleCancel: () => Promise<void>
  handleAskUserQuestion: (
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) => Promise<void>
  handleExitPlanMode: (
    toolUseId: string,
    confirmed: boolean,
    clearContext?: boolean,
    message?: string
  ) => Promise<void>
  handleOpenLocalLink: (target: { path: string; line?: number; column?: number }) => Promise<void>
}

export function useChatPanelState(socket: KannaSocket, chatId: string | null): ChatPanelState {
  const [chatSnapshot, setChatSnapshot] = useState<ChatSnapshot | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [inputHeight, setInputHeight] = useState(148)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chatId) {
      setChatSnapshot(null)
      return
    }

    setChatSnapshot(null)
    return socket.subscribe<ChatSnapshot | null>({ type: "chat", chatId }, (snapshot) => {
      setChatSnapshot(snapshot)
      setCommandError(null)
    })
  }, [chatId, socket])

  useLayoutEffect(() => {
    const element = inputRef.current
    if (!element) return

    const observer = new ResizeObserver(() => {
      setInputHeight(element.getBoundingClientRect().height)
    })
    observer.observe(element)
    setInputHeight(element.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [])

  const activeChatSnapshot = useMemo(
    () => getActiveChatSnapshot(chatSnapshot, chatId),
    [chatId, chatSnapshot]
  )

  const messages = useMemo(
    () => processTranscriptMessages(activeChatSnapshot?.messages ?? []),
    [activeChatSnapshot?.messages]
  )
  const latestToolIds = useMemo(() => getLatestToolIds(messages), [messages])
  const runtime = activeChatSnapshot?.runtime ?? null
  const availableProviders = activeChatSnapshot?.availableProviders ?? PROVIDERS
  const isProcessing = isProcessingStatus(runtime?.status)
  const canCancel = canCancelStatus(runtime?.status)
  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = !isAtBottom && messages.length > 0

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (shouldPinTranscriptToBottom(distance)) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
    }
  }, [chatId, inputHeight, messages.length, runtime?.status])

  function updateScrollState() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setIsAtBottom(distance < 24)
  }

  function scrollToBottom() {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }

  async function handleSend(
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) {
    if (!chatId) return
    try {
      await socket.command({
        type: "chat.send",
        chatId,
        provider: options?.provider,
        content,
        model: options?.model,
        modelOptions: options?.modelOptions,
        planMode: options?.planMode,
      })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function handleCancel() {
    if (!chatId) return
    try {
      await socket.command({ type: "chat.cancel", chatId })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleAskUserQuestion(
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) {
    if (!chatId) return
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId,
        toolUseId,
        result: { questions, answers },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleExitPlanMode(toolUseId: string, confirmed: boolean, clearContext?: boolean, message?: string) {
    if (!chatId) return
    if (confirmed) {
      useChatPreferencesStore.getState().setComposerPlanMode(false)
    }
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId,
        toolUseId,
        result: {
          confirmed,
          ...(clearContext ? { clearContext: true } : {}),
          ...(message ? { message } : {}),
        },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenLocalLink(target: { path: string; line?: number; column?: number }) {
    const preferences = useTerminalPreferencesStore.getState()
    try {
      await socket.command({
        type: "system.openExternal",
        action: "open_editor",
        localPath: target.path,
        line: target.line,
        column: target.column,
        editor: {
          preset: preferences.editorPreset,
          commandTemplate: preferences.editorCommandTemplate,
        },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    chatId,
    chatSnapshot,
    messages,
    latestToolIds,
    runtime,
    availableProviders,
    isProcessing,
    canCancel,
    commandError,
    scrollRef,
    inputRef,
    transcriptPaddingBottom,
    showScrollButton,
    updateScrollState,
    scrollToBottom,
    handleSend,
    handleCancel,
    handleAskUserQuestion,
    handleExitPlanMode,
    handleOpenLocalLink,
  }
}
