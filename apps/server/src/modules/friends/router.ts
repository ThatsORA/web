// Owner: Ojas — username search + close-friend handshake.
// Never reveal whether the other person added you.
import { Router } from "express";
import { routes } from "@web/contract";
import { requireAuth } from "../../lib/auth";
import { notImplemented } from "../../lib/notImplemented";

export const friendsRouter = Router();
friendsRouter.use(requireAuth);
friendsRouter.get(routes.userSearch, notImplemented("Ojas")); // ?q= → UserSearchResponse
friendsRouter.get(routes.closeFriends, notImplemented("Ojas")); // → CloseFriendsResponse
friendsRouter.post(routes.closeFriends, notImplemented("Ojas")); // AddCloseFriendRequest; if now mutual → triggerMatcher()
friendsRouter.delete("/friends/close/:userId", notImplemented("Ojas"));
