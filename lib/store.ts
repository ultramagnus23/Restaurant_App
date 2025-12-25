"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Currency, Decision } from "./types"

interface AppState {
  currency: Currency
  setCurrency: (currency: Currency) => void

  // Decision tracking
  decisions: Decision[]
  setDecisions: (decisions: Decision[]) => void
  updateDecisionStatus: (id: string, status: Decision["status"]) => void

  // Data refresh
  lastRefresh: string
  setLastRefresh: (timestamp: string) => void

  // Loading states
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      currency: "INR",
      setCurrency: (currency) => set({ currency }),

      decisions: [],
      setDecisions: (decisions) => set({ decisions }),
      updateDecisionStatus: (id, status) =>
        set((state) => ({
          decisions: state.decisions.map((d) => (d.id === id ? { ...d, status } : d)),
        })),

      lastRefresh: new Date().toISOString(),
      setLastRefresh: (timestamp) => set({ lastRefresh: timestamp }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: "restaurant-analytics-storage",
    },
  ),
)
