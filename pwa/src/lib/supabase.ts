// Supabase PostGREST client for Starlog. Read-only by RLS design: the PWA
// holds only the anon key, and the anon role has SELECT grants only.
// Writes (entries, prompts, reminders, decorations) are the agent's job,
// done with stronger credentials outside this app.
//
// Empirically verified against the live project: every request MUST send
// the `apikey` header. `Authorization: Bearer` alone 401s with
// "No API key found in request". We send both.

export interface SbConfig {
  url: string; // e.g. https://xyz.supabase.co (no trailing slash)
  anonKey: string;
}

const STORAGE_KEY = 'starlog:config';

const PROJECT_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

export function isValidProjectUrl(url: string): boolean {
  return PROJECT_URL_RE.test(url.trim().replace(/\/+$/, ''));
}

/**
 * One-tap onboarding: read ?supabase_url= & ?anon_key= from the address bar,
 * validate them, then strip them from the URL so the key never lingers in
 * history or a copied link. Treat a setup link like a password — anyone with
 * it can read the journal.
 */
export function consumeLinkConfig(): { url: string; anonKey: string } {
  const out = { url: '', anonKey: '' };
  try {
    const q = new URLSearchParams(window.location.search);
    const url = (q.get('supabase_url') ?? '').trim().replace(/\/+$/, '');
    const key = (q.get('anon_key') ?? '').trim();
    if (url && isValidProjectUrl(url)) out.url = url;
    if (key.length >= 20) out.anonKey = key;
    if (q.has('supabase_url') || q.has('anon_key')) {
      q.delete('supabase_url');
      q.delete('anon_key');
      const rest = q.toString();
      window.history.replaceState(
        null,
        '',
        window.location.pathname +
          (rest ? `?${rest}` : '') +
          window.location.hash,
      );
    }
  } catch {
    /* malformed URL — fall through to manual setup */
  }
  return out;
}

export function loadConfig(): SbConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SbConfig;
    if (typeof c.url !== 'string' || typeof c.anonKey !== 'string') return null;
    return { url: c.url.replace(/\/+$/, ''), anonKey: c.anonKey.trim() };
  } catch {
    return null;
  }
}

export function saveConfig(c: SbConfig): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ url: c.url.replace(/\/+$/, ''), anonKey: c.anonKey.trim() }),
  );
}

export function clearConfig(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export class SbError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function sbFetch(
  cfg: SbConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${cfg.url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = (body as { message?: string }).message ?? JSON.stringify(body);
    } catch {
      /* non-JSON error body */
    }
    throw new SbError(res.status, detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// --- row shapes (mirror spec/tables.sql) ---

export interface Tenant {
  id: string;
  slug: string;
  display_name: string;
}

export interface Entry {
  id: string;
  tenant_id: string;
  entry_date: string; // yyyy-mm-dd
  weekday: number; // ISO 1..7
  body_text: string;
  body_format: string;
}

export interface Prompt {
  id: string;
  prompt_date: string;
  body: string;
  flavor: 'short' | 'deep' | 'maker' | 'odd';
}

export interface Reminder {
  id: string;
  title: string;
  detail: string;
  remind_at: string; // ISO timestamptz
  importance: 'low' | 'normal' | 'high';
  urgency: 'low' | 'normal' | 'high';
  status: 'open' | 'done' | 'dismissed';
}

export interface Decoration {
  id: string;
  entry_date: string | null;
  kind: 'sketch' | 'doodle' | 'sticker';
  svg: string;
  z: number;
}

export interface Attachment {
  id: string;
  entry_id: string;
  type: 'audio';
  storage_path: string;
  duration_ms: number | null;
  mime_type: string | null;
  created_at: string;
}

/** A sound described as data: a note list rendered by the PWA synth. */
export interface Score {
  id: string;
  entry_id: string;
  decoration_id: string | null;
  title: string | null;
  score: {
    voice?: string;
    room?: number;
    notes: Array<{ n: number; t: number; d: number; v: number }>;
  };
  created_at: string;
}

export interface Capabilities {
  spec_version: string;
  operations: string[];
}

// --- queries ---

let tenantCache: { cfg: SbConfig; id: string } | null = null;

/** Resolve the 'personal' tenant id, cached per config. */
export async function getTenantId(cfg: SbConfig): Promise<string> {
  if (tenantCache && tenantCache.cfg.url === cfg.url) return tenantCache.id;
  const rows = (await sbFetch(
    cfg,
    `/tenants?slug=eq.personal&select=id`,
  )) as Tenant[];
  if (rows.length === 0) throw new SbError(404, 'No tenant found');
  tenantCache = { cfg, id: rows[0].id };
  return rows[0].id;
}

export async function getCapabilities(cfg: SbConfig): Promise<Capabilities> {
  const rows = (await sbFetch(
    cfg,
    `/capabilities?select=spec_version,operations`,
  )) as Capabilities[];
  if (rows.length === 0) throw new SbError(404, 'No capabilities row');
  return rows[0];
}


/** Entries for the given dates (entry_date is unique per tenant). */
export async function fetchEntriesByDates(
  cfg: SbConfig,
  tenantId: string,
  dates: string[],
): Promise<Entry[]> {
  if (dates.length === 0) return [];
  const list = dates.join(',');
  return (await sbFetch(
    cfg,
    `/entries?tenant_id=eq.${tenantId}&entry_date=in.(${list})` +
      `&order=entry_date.desc` +
      `&select=id,entry_date,weekday,body_text,body_format`,
  )) as Entry[];
}

/** Entry dates in [from, to] (inclusive) that have entries — for the calendar. */
export async function fetchEntryDates(
  cfg: SbConfig,
  tenantId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const rows = (await sbFetch(
    cfg,
    `/entries?tenant_id=eq.${tenantId}` +
      `&entry_date=gte.${from}&entry_date=lte.${to}` +
      `&select=entry_date`,
  )) as { entry_date: string }[];
  return [...new Set(rows.map((r) => r.entry_date))];
}

/** Recent prompts, newest first. */
export async function fetchPrompts(
  cfg: SbConfig,
  tenantId: string,
  limit = 14,
): Promise<Prompt[]> {
  return (await sbFetch(
    cfg,
    `/prompts?tenant_id=eq.${tenantId}` +
      `&order=prompt_date.desc&limit=${limit}` +
      `&select=id,prompt_date,body,flavor`,
  )) as Prompt[];
}

/** Prompts for the given dates (prompt_date is unique per tenant). */
export async function fetchPromptsByDates(
  cfg: SbConfig,
  tenantId: string,
  dates: string[],
): Promise<Prompt[]> {
  if (dates.length === 0) return [];
  const list = dates.join(',');
  return (await sbFetch(
    cfg,
    `/prompts?tenant_id=eq.${tenantId}&prompt_date=in.(${list})` +
      `&select=id,prompt_date,body,flavor`,
  )) as Prompt[];
}

/** Open reminders with remind_at in [fromIso, toIso). */
export async function fetchReminders(
  cfg: SbConfig,
  tenantId: string,
  fromIso: string,
  toIso: string,
): Promise<Reminder[]> {
  return (await sbFetch(
    cfg,
    `/reminders?tenant_id=eq.${tenantId}&status=eq.open` +
      `&remind_at=gte.${encodeURIComponent(fromIso)}` +
      `&remind_at=lt.${encodeURIComponent(toIso)}` +
      `&order=remind_at&select=id,title,detail,remind_at,importance,urgency,status`,
  )) as Reminder[];
}

/** Decorations owned by any of the given dates, ordered by z. */
export async function fetchDecorations(
  cfg: SbConfig,
  tenantId: string,
  dates: string[],
): Promise<Decoration[]> {
  if (dates.length === 0) return [];
  const list = dates.join(',');
  return (await sbFetch(
    cfg,
    `/decorations?tenant_id=eq.${tenantId}` +
      `&entry_date=in.(${list})&order=z` +
      `&select=id,entry_date,kind,svg,z`,
  )) as Decoration[];
}

/** Audio attachments for the given entry ids, oldest first. */
export async function fetchAttachmentsByEntryIds(
  cfg: SbConfig,
  tenantId: string,
  entryIds: string[],
): Promise<Attachment[]> {
  if (entryIds.length === 0) return [];
  const list = entryIds.join(',');
  return (await sbFetch(
    cfg,
    `/attachments?tenant_id=eq.${tenantId}&entry_id=in.(${list})` +
      `&order=created_at` +
      `&select=id,entry_id,type,storage_path,duration_ms,mime_type,created_at`,
  )) as Attachment[];
}

/** Public URL for a stored audio file (bucket is public-read). */
export function audioPublicUrl(cfg: SbConfig, storagePath: string): string {
  return `${cfg.url}/storage/v1/object/public/audio-snippets/${storagePath}`;
}

/** Sound scores for the given entry ids, oldest first. */
export async function fetchScoresByEntryIds(
  cfg: SbConfig,
  tenantId: string,
  entryIds: string[],
): Promise<Score[]> {
  if (entryIds.length === 0) return [];
  const list = entryIds.join(',');
  return (await sbFetch(
    cfg,
    `/scores?tenant_id=eq.${tenantId}&entry_id=in.(${list})` +
      `&order=created_at` +
      `&select=id,entry_id,decoration_id,title,score,created_at`,
  )) as Score[];
}
