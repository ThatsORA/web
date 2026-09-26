// Route paths, relative to API_PREFIX. Use these constants on both sides.
export const API_PREFIX = "/api/v1";

export const routes = {
  signup: "/auth/signup",
  login: "/auth/login",
  me: "/me",
  pushToken: `${API_PREFIX}/me/push-token`,
  busyBlocks: "/busy-blocks",
  userSearch: "/users/search", // ?q=
  closeFriends: "/friends/close",
  closeFriend: (userId: string) => `/friends/close/${userId}`,
  favorites: "/favorites",
  events: "/events",
  event: (id: string) => `/events/${id}`,
  vote: (id: string) => `/events/${id}/vote`,
  ghostPass: (id: string) => `/events/${id}/ghost-pass`,
  reportClosed: (id: string) => `/events/${id}/report-closed`,
  runMatcher: "/internal/run-matcher", // header X-Internal-Secret
  expenses: (id: string) => `/events/${id}/expenses`,
  expenseSplit: (id: string) => `/expense-splits/${id}`,
  googleCalendar: "/calendar/google",
  googleCalendarStart: "/calendar/google/start",
  googleCalendarCallback: "/calendar/google/callback",
  googleCalendarSync: "/calendar/google/sync",
} as const;
