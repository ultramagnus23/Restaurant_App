export async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "An error occurred" }))
    throw new Error(error.message || `API Error: ${response.status}`)
  }

  return response.json()
}

export const api = {
  // Orders
  getOrders: (params?: { startDate?: string; endDate?: string; channel?: string }) =>
    fetchAPI<any>(`/orders?${new URLSearchParams(params as any)}`),

  // Menu
  getMenuItems: () => fetchAPI<any>("/menu"),
  getMenuEngineering: () => fetchAPI<any>("/menu/engineering"),
  updateMenuItem: (id: string, data: any) => fetchAPI(`/menu/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Analytics
  getDecisions: () => fetchAPI<any>("/analytics/decisions"),
  updateDecision: (id: string, status: string) =>
    fetchAPI(`/analytics/decisions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getChannelMetrics: () => fetchAPI<any>("/analytics/channels"),
  getServerPerformance: () => fetchAPI<any>("/analytics/servers"),
  getCapacityMetrics: () => fetchAPI<any>("/analytics/capacity"),
  getNewDishMetrics: () => fetchAPI<any>("/analytics/new-dishes"),
  getOpportunityCost: () => fetchAPI<any>("/analytics/opportunity-cost"),

  // Scenarios
  createScenario: (data: any) => fetchAPI("/scenarios", { method: "POST", body: JSON.stringify(data) }),
  getScenarios: () => fetchAPI<any>("/scenarios"),
}
