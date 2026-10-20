export const API_ERROR_MESSAGES = {
  network: "Can't reach Shipyard. Check your connection and try again.",
  unauthorized: "Your session has expired. Sign in again.",
  forbidden: "You don't have permission to do that.",
  server: "Something went wrong on the server.",
  unexpected: "Shipyard sent an unexpected response. Reload and try again.",
  failed: "Operation failed",
};

export const POLL_INTERVALS = {
  active: 2000,
  system: 3000,
  deployment: 5000,
  history: 10000,
  resources: 15000,
  metrics: 30000,
  session: 60000,
};
