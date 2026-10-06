import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getDeviceId, getDeviceName, getKeepSignedInPref, setKeepSignedInPref } from "@/lib/device";
import { toast } from "sonner";

type AppRole = Database["public"]["Enums"]["app_role"];
type UserStatus = Database["public"]["Enums"]["user_status"];

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  status: UserStatus;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isTrustedDevice: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  /** Mark the current browser as a trusted device for the signed-in user. */
  trustCurrentDevice: () => Promise<void>;
  /** Remove the current browser from the user's trusted devices. */
  untrustCurrentDevice: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Inactivity timeout when signed in from a non-trusted device.
const INACTIVITY_MS = 2 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTrustedDevice, setIsTrustedDevice] = useState(false);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfile = async (userId: string) => {
    const [{ data: p }, { data: r }, { data: td }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, status").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("trusted_devices")
        .select("id")
        .eq("user_id", userId)
        .eq("device_id", getDeviceId())
        .maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    setRoles((r ?? []).map((x) => x.role as AppRole));
    setIsTrustedDevice(!!td);

    // Bump last_used_at for trusted devices so admins/users can see recent activity.
    if (td) {
      supabase
        .from("trusted_devices")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", (td as { id: string }).id)
        .then(() => undefined);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
        setIsTrustedDevice(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const revive = () => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        const exp = (data.session.expires_at ?? 0) * 1000;
        if (exp - Date.now() < 2 * 60 * 1000) {
          supabase.auth.refreshSession().catch(() => undefined);
        }
      });
    };
    const onVisible = () => { if (document.visibilityState === "visible") revive(); };
    window.addEventListener("focus", revive);
    window.addEventListener("online", revive);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", revive);
      window.removeEventListener("online", revive);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Inactivity timeout for non-trusted devices. "Keep me signed in" is honored
  // ONLY when the current device is trusted; otherwise 2 min of no activity
  // signs the user out.
  useEffect(() => {
    if (!session) return;
    const keep = getKeepSignedInPref();
    if (isTrustedDevice && keep) return; // persistent session allowed

    const clearTimer = () => {
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
    };
    const trigger = async () => {
      clearTimer();
      toast.warning("Signed out after 2 minutes of inactivity (device not trusted).");
      await supabase.auth.signOut();
    };
    const reset = () => {
      clearTimer();
      inactivityTimer.current = setTimeout(trigger, INACTIVITY_MS);
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => {
      clearTimer();
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", reset);
    };
  }, [session, isTrustedDevice]);

  const trustCurrentDevice = async () => {
    if (!session?.user) return;
    const { error } = await supabase.from("trusted_devices").upsert(
      {
        user_id: session.user.id,
        device_id: getDeviceId(),
        device_name: getDeviceName(),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,device_id" },
    );
    if (error) {
      toast.error("Could not mark device as trusted");
      return;
    }
    setIsTrustedDevice(true);
  };

  const untrustCurrentDevice = async () => {
    if (!session?.user) return;
    await supabase
      .from("trusted_devices")
      .delete()
      .eq("user_id", session.user.id)
      .eq("device_id", getDeviceId());
    setIsTrustedDevice(false);
    setKeepSignedInPref(false);
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    loading,
    isTrustedDevice,
    signOut: async () => {
      // Signing out is an explicit user action — clear the keep-me pref so the
      // next sign-in on this browser starts from "not persistent" by default.
      setKeepSignedInPref(false);
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
    hasRole: (r) => roles.includes(r),
    hasAnyRole: (rs) => rs.some((r) => roles.includes(r)),
    trustCurrentDevice,
    untrustCurrentDevice,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
