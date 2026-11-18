import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const SESSION_KEY = "crestMobileSession";

export type StudentSession = { role: "student"; name: string; phone: string; token: string };
export type AdminSession = { role: "admin"; name: string; adminKey: string };
export type CrestSession = StudentSession | AdminSession;

function config() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("CREST is not configured. Add the existing Supabase project URL and anon key to mobile/.env.");
  }
}

export async function crestRpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  config();
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(args),
  });
  const body = await response.text();
  let data: any = null;
  try { data = body ? JSON.parse(body) : null; } catch {}
  if (!response.ok) throw new Error(data?.message || data?.hint || `CREST request failed (${response.status})`);
  return data as T;
}

export const normaliseName = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
export const normalisePhone = (value: string) => value.replace(/[^\d+]/g, "");

export async function saveCrestSession(session: CrestSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export async function loadCrestSession(): Promise<CrestSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as CrestSession : null;
  } catch { return null; }
}
export async function clearCrestSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}
export async function signInStudent(name: string, phone: string, password: string): Promise<StudentSession> {
  const result = await crestRpc<any>("student_login", {
    p_name: name,
    p_phone: normalisePhone(phone),
    p_password: password,
  });
  if (!result?.token) throw new Error("The details did not match an active CREST student account.");
  const session: StudentSession = {
    role: "student",
    name: result.name || name.trim(),
    phone: result.phone || normalisePhone(phone),
    token: result.token,
  };
  await saveCrestSession(session);
  return session;
}
export async function signInAdmin(name: string, password: string): Promise<AdminSession> {
  const adminKey = `${normaliseName(name)}|${password}`;
  const valid = await crestRpc<boolean>("admin_check", { p_key: adminKey });
  if (!valid) throw new Error("The administrator name or password is incorrect.");
  const session: AdminSession = { role: "admin", name: name.trim(), adminKey };
  // Do not persist the administrator password-derived key on the device.
  return session;
}
export async function validateCrestSession(session: CrestSession): Promise<boolean> {
  if (session.role === "admin") return true;
  const result = await crestRpc<any>("student_me", { p_token: session.token });
  return !!result;
}
export async function signOutCrest(session: CrestSession) {
  if (session.role === "student") {
    try { await crestRpc("student_logout", { p_token: session.token }); } catch {}
  }
  await clearCrestSession();
}

export async function loginStudent(name: string, phone: string, password: string): Promise<CrestSession> {
  return signInStudent(name, phone, password);
}
export async function loginAdmin(name: string, password: string): Promise<CrestSession> {
  return signInAdmin(name, password);
}
export async function restore(): Promise<CrestSession | null> {
  const session = await loadCrestSession();
  if (!session) return null;
  try {
    if (await validateCrestSession(session)) return session;
    await clearCrestSession();
    return null;
  } catch {
    // Preserve a saved session during a temporary network outage.
    return session;
  }
}
export async function logout(session: CrestSession) {
  return signOutCrest(session);
}
