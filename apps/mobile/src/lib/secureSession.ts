// Owner: Andy — the app's session, stored in the device keychain/keystore.
// Sign-up/login (Ojas) calls `session.save(res.token)`.
import * as SecureStore from "expo-secure-store";
import { createSession } from "./session";

export const session = createSession(SecureStore);
