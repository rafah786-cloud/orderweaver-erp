// Client-side device identity + platform helpers used by the trusted-device
// flow. The device_id is a stable per-browser random UUID kept in localStorage.
// It is NOT a security token — trust is enforced server-side via RLS keyed on
// user_id + device_id in the `trusted_devices` table.

const DEVICE_ID_KEY = "abd.deviceId";
const KEEP_SIGNED_IN_KEY = "abd.keepSignedIn";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  let platform = "Device";
  if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
  else if (/Android/i.test(ua)) platform = "Android";
  else if (/Mac OS X/i.test(ua)) platform = "Mac";
  else if (/Windows/i.test(ua)) platform = "Windows";
  else if (/Linux/i.test(ua)) platform = "Linux";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return `${platform} · ${browser}`;
}

export function getKeepSignedInPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEEP_SIGNED_IN_KEY) === "1";
}

export function setKeepSignedInPref(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) localStorage.setItem(KEEP_SIGNED_IN_KEY, "1");
  else localStorage.removeItem(KEEP_SIGNED_IN_KEY);
}
