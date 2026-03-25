import { useEffect, useMemo } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import { AppDialogProvider } from "../components/ui/app-dialog"
import { TooltipProvider } from "../components/ui/tooltip"
import { SDK_CLIENT_APP } from "../../shared/branding"
import { KannaSidebar } from "./KannaSidebar"
import { ChatPage } from "./ChatPage"
import { LocalProjectsPage } from "./LocalProjectsPage"
import { SettingsPage } from "./SettingsPage"
import { useKannaState } from "./useKannaState"
import { useSplitViewStore } from "../stores/splitViewStore"
import { normalizeChatId } from "../lib/utils"

const VERSION_SEEN_STORAGE_KEY = "kanna:last-seen-version"

export function shouldRedirectToChangelog(pathname: string, currentVersion: string, seenVersion: string | null) {
  return pathname === "/" && Boolean(currentVersion) && seenVersion !== currentVersion
}

function KannaLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const state = useKannaState(params.chatId ?? null)
  const showMobileOpenButton = location.pathname === "/" || location.pathname.startsWith("/settings")
  const currentVersion = SDK_CLIENT_APP.split("/")[1] ?? "unknown"

  const currentProjectId = state.runtime?.projectId ?? null
  const currentProjectSplit = useSplitViewStore((store) =>
    currentProjectId ? store.projects[currentProjectId] : undefined
  )
  const addPanel = useSplitViewStore((store) => store.addPanel)

  const splitChatIds = useMemo(() => {
    const ids = new Set<string>()
    for (const panel of currentProjectSplit?.panels ?? []) {
      ids.add(normalizeChatId(panel.chatId))
    }
    return ids
  }, [currentProjectSplit?.panels])

  useEffect(() => {
    const seenVersion = window.localStorage.getItem(VERSION_SEEN_STORAGE_KEY)
    const shouldRedirect = shouldRedirectToChangelog(location.pathname, currentVersion, seenVersion)
    window.localStorage.setItem(VERSION_SEEN_STORAGE_KEY, currentVersion)
    if (!shouldRedirect) return
    navigate("/settings/changelog", { replace: true })
  }, [currentVersion, location.pathname, navigate])

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden">
      <KannaSidebar
        data={state.sidebarData}
        activeChatId={state.activeChatId}
        splitChatIds={splitChatIds}
        connectionStatus={state.connectionStatus}
        ready={state.sidebarReady}
        open={state.sidebarOpen}
        collapsed={state.sidebarCollapsed}
        showMobileOpenButton={showMobileOpenButton}
        onOpen={state.openSidebar}
        onClose={state.closeSidebar}
        onCollapse={state.collapseSidebar}
        onExpand={state.expandSidebar}
        onCreateChat={(projectId) => {
          void state.handleCreateChat(projectId)
        }}
        onSplitChat={(chatId) => {
          if (!state.activeChatId) {
            navigate(`/chat/${chatId}`)
            return
          }

          // Find which project the clicked chat belongs to
          const clickedGroup = state.sidebarData.projectGroups.find((g) =>
            g.chats.some((c) => c.chatId === chatId)
          )

          if (clickedGroup && currentProjectId && clickedGroup.groupKey !== currentProjectId) {
            // Different project → open in new browser window
            window.open(`/chat/${chatId}`, "_blank")
            return
          }

          // Same project → add to split
          if (currentProjectId) {
            addPanel(currentProjectId, chatId, state.activeChatId)
          }
        }}
        onDeleteChat={(chat) => {
          void state.handleDeleteChat(chat)
        }}
        onRemoveProject={(projectId) => {
          void state.handleRemoveProject(projectId)
        }}
        updateSnapshot={state.updateSnapshot}
        onInstallUpdate={() => {
          void state.handleInstallUpdate()
        }}
      />
      <Outlet context={state} />
    </div>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <AppDialogProvider>
        <Routes>
          <Route element={<KannaLayout />}>
            <Route path="/" element={<LocalProjectsPage />} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:sectionId" element={<SettingsPage />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
          </Route>
        </Routes>
      </AppDialogProvider>
    </TooltipProvider>
  )
}
