import { create } from "zustand"

export interface SplitPanel {
  chatId: string
}

interface SplitViewState {
  panels: SplitPanel[]
  focusedIndex: number
  addPanel: (chatId: string, primaryChatId: string | null) => void
  removePanel: (chatId: string) => void
  setFocused: (index: number) => void
  clear: () => void
}

export const useSplitViewStore = create<SplitViewState>()((set, get) => ({
  panels: [],
  focusedIndex: 0,

  addPanel: (chatId, primaryChatId) =>
    set((state) => {
      if (chatId === primaryChatId) return state
      if (state.panels.some((p) => p.chatId === chatId)) return state
      return {
        panels: [...state.panels, { chatId }],
        focusedIndex: state.panels.length + 1,
      }
    }),

  removePanel: (chatId) =>
    set((state) => {
      const panelIndex = state.panels.findIndex((p) => p.chatId === chatId)
      if (panelIndex === -1) return state
      const panels = state.panels.filter((p) => p.chatId !== chatId)
      const removedGlobalIndex = panelIndex + 1
      let focusedIndex = state.focusedIndex
      if (focusedIndex === removedGlobalIndex) {
        focusedIndex = 0
      } else if (focusedIndex > removedGlobalIndex) {
        focusedIndex = focusedIndex - 1
      }
      return { panels, focusedIndex: Math.min(focusedIndex, panels.length) }
    }),

  setFocused: (index) =>
    set((state) => {
      const maxIndex = state.panels.length
      return { focusedIndex: Math.min(Math.max(0, index), maxIndex) }
    }),

  clear: () => set({ panels: [], focusedIndex: 0 }),
}))
