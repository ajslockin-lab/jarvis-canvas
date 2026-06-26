// recent-accounts.ts — small localStorage wrapper for the "switch account"
// tab row on /signin.
//
// Why localStorage: the user wants to see tabs of accounts that previously
// signed in on this device. The cookie is the source of truth for the *current*
// session, but a fresh device can have multiple recent accounts whose
// sessionToken is what we'd need to "log back in" as them without a password.
//
// We deliberately do NOT include the password (we never have it plaintext).
// We DO include the sessionToken from the previous signin — it's the same
// opaque string the cookie holds, just mirrored to localStorage so the tab
// can re-present itself after a signout. The token is a one-way door: a
// stolen localStorage string only grants a session that the server can revoke
// at any time.
//
// The list is capped at MAX entries. When a 4th account gets pushed, the
// oldest drops off. The order is "most recently signed in first."

export type RecentAccount = {
  userId: string;
  email: string;
  name: string;
  sessionToken: string;
  lastSeenAt: number;
};

const KEY = "jarvis_recent_accounts";
const MAX = 3;

function readRaw(): RecentAccount[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop any entries that don't have the right shape. This way
    // a future schema change can't crash the signin page on first render.
    return parsed.filter(
      (a): a is RecentAccount =>
        a &&
        typeof a.userId === "string" &&
        typeof a.email === "string" &&
        typeof a.name === "string" &&
        typeof a.sessionToken === "string" &&
        typeof a.lastSeenAt === "number",
    );
  } catch {
    return [];
  }
}

function writeRaw(list: RecentAccount[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // localStorage might be full or disabled (private mode in some browsers).
    // The recent-accounts list is a nice-to-have — never block signin on it.
  }
}

/**
 * Add (or refresh) an account in the list. The most recently seen account
 * is always at index 0. Caps the list at MAX entries.
 */
export function pushRecentAccount(account: RecentAccount): void {
  const list = readRaw().filter((a) => a.userId !== account.userId);
  list.unshift({ ...account, lastSeenAt: Date.now() });
  writeRaw(list.slice(0, MAX));
}

/**
 * Return the most-recent first. Empty array if no accounts.
 */
export function readRecentAccounts(): RecentAccount[] {
  return readRaw().sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/**
 * Drop a specific account (e.g. the server told us the session is gone, or
 * the user explicitly deleted the account). Safe to call with a userId that
 * isn't in the list.
 */
export function removeRecentAccount(userId: string): void {
  writeRaw(readRaw().filter((a) => a.userId !== userId));
}

/**
 * Drop every saved account with this email. Used after a successful
 * password-reset since the server invalidated all of that user's sessions.
 */
export function removeRecentAccountsForEmail(email: string): void {
  const lower = email.toLowerCase();
  writeRaw(readRaw().filter((a) => a.email.toLowerCase() !== lower));
}

/**
 * Wipe the whole list. Called after a successful account deletion so the
 * deleted user doesn't keep haunting the signin page.
 */
export function clearRecentAccounts(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
