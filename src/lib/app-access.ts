import { isRouteDenied, type AppRole } from "@/lib/permissions";
import { safeLocalRedirect } from "@/lib/safe-local-redirect";

export type AppAccessDecision =
  | { kind: "loading" }
  | { kind: "login"; redirect?: string }
  | { kind: "profile-loading" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "allow" };

/**
 * Single guard decision for the whole /_app branch. Fails closed: no session →
 * login, profile not (yet) loaded or belonging to another user → wait, any
 * status other than "approved" → pending, no role policy match → denied.
 * RLS and server-function auth remain the authoritative enforcement.
 */
export function decideAppAccess(input: {
  loading: boolean;
  sessionUserId: string | null;
  profile: { id: string; status: string } | null;
  roles: AppRole[];
  pathname: string;
  href: string;
}): AppAccessDecision {
  if (input.loading) return { kind: "loading" };
  if (!input.sessionUserId) return { kind: "login", redirect: safeLocalRedirect(input.href) };
  if (!input.profile || input.profile.id !== input.sessionUserId) return { kind: "profile-loading" };
  if (input.profile.status !== "approved") return { kind: "pending" };
  if (isRouteDenied(input.pathname, input.roles)) return { kind: "denied" };
  return { kind: "allow" };
}
