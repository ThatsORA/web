import cors from "cors";
import express from "express";
import { API_PREFIX } from "@web/contract";
import { authRouter } from "./modules/auth/router";
import { friendsRouter } from "./modules/friends/router";
import { calendarRouter } from "./modules/calendar/router";
import { matchingRouter } from "./modules/matching/router";
import { venuesRouter } from "./modules/venues/router";
import { votingRouter } from "./modules/voting/router";
import { expensesRouter } from "./modules/expenses/router";
import { eventsRouter } from "./modules/events/router";
import { favoritesRouter } from "./modules/favorites/router";
import { squadsRouter } from "./modules/groups/router";
import { chatRouter } from "./modules/chat/router";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(authRouter); // must stay first: signup/login are public
  api.use(calendarRouter);
  api.use(favoritesRouter);
  api.use(eventsRouter);
  api.use(votingRouter);
  api.use(venuesRouter);
  api.use(matchingRouter);
  api.use(expensesRouter);
  api.use(squadsRouter);
  api.use(chatRouter);
  api.use(friendsRouter); // uses router-level requireAuth, keep last
  app.use(API_PREFIX, api);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  return app;
}
