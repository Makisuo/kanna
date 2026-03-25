import { create } from "zustand"

export interface SplitPanel {
  chatId: string
}

export interface ProjectSplitState {
  panels: SplitPanel[]
  focusedIndex: number
}

interface SplitViewState {
  projects: Record<string, ProjectSplitState>
  addPanel: (projectId: string, chatId: string, primaryChatId: string | null) => void
  removePanel: (projectId: string, chatId: string) => void
  setFocused: (projectId: string, index: number) => void
  clearProject: (projectId: string) => void
}

function getProjectState(projects: Record<string, ProjectSplitState>, projectId: string): ProjectSplitState {
  return projects[projectId] ?? { panels: [], focusedIndex: 0 }
}

export const useSplitViewStore = create<SplitViewState>()((set) => ({
  projects: {},

  addPanel: (projectId, chatId, primaryChatId) =>
    set((state) => {
      const project = getProjectState(state.projects, projectId)
      if (chatId === primaryChatId) return state
      if (project.panels.some((p) => p.chatId === chatId)) return state
      return {
        projects: {
          ...state.projects,
          [projectId]: {
            panels: [...project.panels, { chatId }],
            focusedIndex: project.panels.length + 1,
          },
        },
      }
    }),

  removePanel: (projectId, chatId) =>
    set((state) => {
      const project = getProjectState(state.projects, projectId)
      const panelIndex = project.panels.findIndex((p) => p.chatId === chatId)
      if (panelIndex === -1) return state
      const panels = project.panels.filter((p) => p.chatId !== chatId)
      const removedGlobalIndex = panelIndex + 1
      let focusedIndex = project.focusedIndex
      if (focusedIndex === removedGlobalIndex) {
        focusedIndex = 0
      } else if (focusedIndex > removedGlobalIndex) {
        focusedIndex = focusedIndex - 1
      }
      return {
        projects: {
          ...state.projects,
          [projectId]: {
            panels,
            focusedIndex: Math.min(focusedIndex, panels.length),
          },
        },
      }
    }),

  setFocused: (projectId, index) =>
    set((state) => {
      const project = getProjectState(state.projects, projectId)
      const maxIndex = project.panels.length
      return {
        projects: {
          ...state.projects,
          [projectId]: {
            ...project,
            focusedIndex: Math.min(Math.max(0, index), maxIndex),
          },
        },
      }
    }),

  clearProject: (projectId) =>
    set((state) => {
      const { [projectId]: _removed, ...rest } = state.projects
      return { projects: rest }
    }),
}))
