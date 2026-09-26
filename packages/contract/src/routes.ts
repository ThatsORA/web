// Route paths, relative to API_PREFIX. Use these constants on both sides.
export const API_PREFIX = "/api/v1";

export const routes = {
  signup: "/auth/signup",
  login: "/auth/login",
  me: "/me",
  verifyEmailSend: "/auth/verify-email/send", // 204, or 429 + Retry-After during the 60 s cooldown
  verifyEmail: "/auth/verify-email", // { code } → Me
  busyBlocks: "/busy-blocks",
  userSearch: "/users/search", // ?q=
  user: (id: string) => `/users/${id}`, // public profile
  meEmail: "/me/email", // POST { new_email, password } → code to the new address
  meEmailConfirm: "/me/email/confirm", // POST { code } → Me
  closeFriends: "/friends/close",
  closeFriend: (userId: string) => `/friends/close/${userId}`,
  squads: "/squads",
  squad: (id: string) => `/squads/${id}`, // PATCH { name }
  squadInvite: (id: string) => `/squads/${id}/invite`,
  squadInvitee: (id: string, userId: string) => `/squads/${id}/invites/${userId}`, // DELETE = an active member objects
  squadRespond: (id: string) => `/squads/${id}/respond`,
  squadLeave: (id: string) => `/squads/${id}/leave`,
  friends: "/friends",
  friend: (userId: string) => `/friends/${userId}`, // DELETE = unfriend
  friendRequests: "/friends/requests",
  friendRequest: (id: string) => `/friends/requests/${id}`, // DELETE = decline (recipient) or cancel (requester)
  acceptFriendRequest: (id: string) => `/friends/requests/${id}/accept`,
  favorites: "/favorites",
  events: "/events",
  event: (id: string) => `/events/${id}`,
  vote: (id: string) => `/events/${id}/vote`,
  ghostPass: (id: string) => `/events/${id}/ghost-pass`,
  reportClosed: (id: string) => `/events/${id}/report-closed`,
  runMatcher: "/internal/run-matcher", // header X-Internal-Secret
  expenses: (id: string) => `/events/${id}/expenses`,
  expenseSplit: (id: string) => `/expense-splits/${id}`,
} as const;
