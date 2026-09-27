// Route paths, relative to API_PREFIX. Use these constants on both sides.
export const API_PREFIX = "/api/v1";

export const routes = {
  signup: "/auth/signup",
  login: "/auth/login",
  passwordResetRequest: "/auth/password-reset/request",
  passwordResetConfirm: "/auth/password-reset/confirm",
  me: "/me",
  verifyEmailSend: "/auth/verify-email/send", // 204, or 429 + Retry-After during the 60 s cooldown
  verifyEmail: "/auth/verify-email", // { code } → Me
  pushToken: `${API_PREFIX}/me/push-token`,
  busyBlocks: "/busy-blocks",
  manualBusyBlocks: "/availability/manual-busy-blocks",
  manualBusyBlock: (id: string) => `/availability/manual-busy-blocks/${id}`,
  myAvailability: "/availability/me", // GET → the caller's own free windows, as the matcher sees them
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
  changeSpot: (id: string) => `/events/${id}/change-spot`,
  eventInvite: (id: string) => `/events/${id}/invite`, // POST InviteToEventRequest → 204 (#345)
  joinInvite: (id: string) => `/events/${id}/join`, // POST → 204: a late invitee's "I'm in" (#407)
  declineInvite: (id: string) => `/events/${id}/decline`, // POST → 204: a late invitee's "Can't make it" (#345, #407)
  runMatcher: "/internal/run-matcher", // header X-Internal-Secret
  runScheduler: "/scheduler/run", // POST → 202, runs the scheduler with force; the card arrives over the socket
  expenses: (id: string) => `/events/${id}/expenses`,
  expenseSplit: (id: string) => `/expense-splits/${id}`,
  eventMessages: (id: string) => `/events/${id}/messages`,
  eventNominations: (id: string) => `/events/${id}/nominations`,
  eventNominationVote: (id: string, nominationId: string) => `/events/${id}/nominations/${nominationId}/vote`,
  eventNominationRespond: (id: string, nominationId: string) => `/events/${id}/nominations/${nominationId}/respond`,
  googleCalendar: "/calendar/google",
  googleCalendarStart: "/calendar/google/start",
  googleCalendarCallback: "/calendar/google/callback",
  googleCalendarSync: "/calendar/google/sync",
} as const;
