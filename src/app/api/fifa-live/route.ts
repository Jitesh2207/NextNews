import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  getClientIp,
  isTrustedSameOriginRequest,
} from "@/lib/apiSecurity";

const BZZOIRO_LIVE_ENDPOINT = "https://sports.bzzoiro.com/api/v2/events/live/";
const BZZOIRO_EVENTS_ENDPOINT = "https://sports.bzzoiro.com/api/v2/events/";
const FOOTBALL_DATA_WC_ENDPOINT =
  "https://api.football-data.org/v4/competitions/WC/matches";

const FIFA_LIVE_RATE_LIMIT = 30;
const FIFA_LIVE_RATE_WINDOW_MS = 60 * 1_000;
const PROVIDER_TIMEOUT_MS = 8_000;
const LIVE_CACHE_MS = 20_000;
const FALLBACK_CACHE_MS = 60_000;
const ERROR_CACHE_MS = 10_000;
const MATCH_LOOKBACK_DAYS = 7;
const MATCH_LOOKAHEAD_DAYS = 14;

type MatchStatus = "LIVE" | "SCHEDULED" | "FINISHED" | "NO_LIVE_MATCH";
type ProviderName = "bzzoiro-sports" | "football-data";

export type NormalizedMatch = {
  status: MatchStatus;
  competition: string;
  stage: string;
  minute: number | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeLogo: string | null;
  awayLogo: string | null;
  updatedAt: string;
  eventDate?: string;
  source: ProviderName | "no-live";
  message?: string;
};

type FifaLiveBody = { match: NormalizedMatch } | { error: string };
type CachedResponse = {
  body: FifaLiveBody;
  status: number;
  expiresAt: number;
};

type ProviderResult<T> =
  | { ok: true; provider: ProviderName; data: T }
  | { ok: false; provider: ProviderName; error: string };

type BzzoiroEvent = {
  id?: number;
  league_id?: number | string | null;
  league_name?: string | null;
  home_team_id?: number | string | null;
  home_team?: string | null;
  away_team_id?: number | string | null;
  away_team?: string | null;
  event_date?: string | null;
  status?: "notstarted" | "inprogress" | "penalties" | "finished" | string;
  period?: string | null;
  current_minute?: number | string | null;
  home_score?: number | string | null;
  away_score?: number | string | null;
  last_updated?: string | null;
};

type BzzoiroLiveResponse = {
  events?: BzzoiroEvent[];
};

type BzzoiroEventsResponse = {
  results?: BzzoiroEvent[];
  events?: BzzoiroEvent[];
};

type FootballDataMatch = {
  status?: string;
  competition?: { name?: string };
  stage?: string;
  minute?: number | null;
  homeTeam?: { name?: string; crest?: string };
  awayTeam?: { name?: string; crest?: string };
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    regularTime?: { home?: number | null; away?: number | null };
    currentPeriod?: { home?: number | null; away?: number | null };
  };
  utcDate?: string;
};

type FootballDataResponse = {
  matches?: FootballDataMatch[];
};

const LIVE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Origin, Referer, Sec-Fetch-Site, Host",
};

let cachedResponse: CachedResponse | null = null;
let inFlightResponse: Promise<CachedResponse> | null = null;

function getPrimaryApiKey(): string {
  return process.env.FIFA_API_KEY?.trim() ?? "";
}

function getFallbackApiKey(): string {
  return process.env.FIFA_API_KEY2?.trim() ?? "";
}

function getBzzoiroLeagueIds(): Set<number> {
  const raw = process.env.FIFA_BZZOIRO_LEAGUE_IDS?.trim() || "27";
  const ids = raw
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Number.isFinite);

  return new Set(ids.length ? ids : [27]);
}

function clampText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 100) : fallback;
}

function asNonNegativeInt(value: number | string | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed as number));
}

function asMinute(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(parsed)) return null;
  return Math.min(130, Math.max(0, Math.trunc(parsed as number)));
}

function sanitizeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function formatBzzoiroPeriod(period: string | null | undefined): string {
  if (!period) return "Live";

  const lower = period.toLowerCase();
  if (lower === "1st_half") return "1st Half";
  if (lower === "halftime") return "Half Time";
  if (lower === "2nd_half") return "2nd Half";
  if (lower === "extra_time") return "Extra Time";
  if (lower === "ft") return "Full Time";

  return clampText(period.replace(/_/g, " "), "Live");
}

function bzzoiroStatus(status: string | undefined): MatchStatus {
  if (status === "finished") return "FINISHED";
  if (status === "notstarted") return "SCHEDULED";
  return "LIVE";
}

function footballDataStatus(status: string | undefined): MatchStatus {
  if (status === "FINISHED") return "FINISHED";
  if (
    status === "TIMED" ||
    status === "SCHEDULED" ||
    status === "POSTPONED" ||
    status === "CANCELLED"
  ) {
    return "SCHEDULED";
  }
  return "LIVE";
}

function isLiveStatus(match: NormalizedMatch): boolean {
  return match.status === "LIVE";
}

function isAllowedBzzoiroLeague(event: BzzoiroEvent): boolean {
  const leagueId = Number(event.league_id);
  return Number.isFinite(leagueId) && getBzzoiroLeagueIds().has(leagueId);
}

function normalizeBzzoiroMatch(event: BzzoiroEvent): NormalizedMatch {
  const homeTeamId = Number(event.home_team_id);
  const awayTeamId = Number(event.away_team_id);
  const updatedAt = normalizeDate(event.last_updated) ?? new Date().toISOString();

  return {
    status: bzzoiroStatus(event.status),
    competition: clampText(event.league_name, "FIFA World Cup 2026"),
    stage: formatBzzoiroPeriod(event.period),
    minute: asMinute(event.current_minute),
    homeTeam: clampText(event.home_team, "Home"),
    awayTeam: clampText(event.away_team, "Away"),
    homeScore: asNonNegativeInt(event.home_score),
    awayScore: asNonNegativeInt(event.away_score),
    homeLogo: Number.isFinite(homeTeamId)
      ? `https://sports.bzzoiro.com/img/team/${homeTeamId}/?bg=transparent`
      : null,
    awayLogo: Number.isFinite(awayTeamId)
      ? `https://sports.bzzoiro.com/img/team/${awayTeamId}/?bg=transparent`
      : null,
    updatedAt,
    eventDate: normalizeDate(event.event_date),
    source: "bzzoiro-sports",
  };
}

function normalizeFootballDataMatch(match: FootballDataMatch): NormalizedMatch {
  const score =
    match.score?.currentPeriod ??
    match.score?.regularTime ??
    match.score?.fullTime;

  return {
    status: footballDataStatus(match.status),
    competition: clampText(match.competition?.name, "FIFA World Cup 2026"),
    stage: clampText(match.stage?.replace(/_/g, " "), "Live"),
    minute: match.minute ?? null,
    homeTeam: clampText(match.homeTeam?.name, "Home"),
    awayTeam: clampText(match.awayTeam?.name, "Away"),
    homeScore: score?.home ?? 0,
    awayScore: score?.away ?? 0,
    homeLogo: sanitizeHttpUrl(match.homeTeam?.crest),
    awayLogo: sanitizeHttpUrl(match.awayTeam?.crest),
    updatedAt: new Date().toISOString(),
    eventDate: normalizeDate(match.utcDate),
    source: "football-data",
  };
}

function buildNoLiveMatch(): NormalizedMatch {
  return {
    status: "NO_LIVE_MATCH",
    competition: "FIFA World Cup 2026",
    stage: "No live match right now",
    minute: null,
    homeTeam: "-",
    awayTeam: "-",
    homeScore: 0,
    awayScore: 0,
    homeLogo: null,
    awayLogo: null,
    updatedAt: new Date().toISOString(),
    source: "no-live",
    message: "No FIFA match is live, upcoming, or recently finished.",
  };
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (!data) {
    throw new Error("Invalid JSON response");
  }

  return data;
}

async function providerCall<T>(
  provider: ProviderName,
  callback: () => Promise<T>,
): Promise<ProviderResult<T>> {
  try {
    return { ok: true, provider, data: await callback() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`FIFA live provider failed: ${provider}: ${message}`);
    return { ok: false, provider, error: message };
  }
}

async function fetchLiveFromBzzoiro(apiKey: string): Promise<NormalizedMatch[]> {
  const data = await fetchJson<BzzoiroLiveResponse>(BZZOIRO_LIVE_ENDPOINT, {
    Authorization: `Token ${apiKey}`,
  });

  return (data.events ?? [])
    .filter(isAllowedBzzoiroLeague)
    .map(normalizeBzzoiroMatch)
    .filter(isLiveStatus);
}

async function fetchLiveFromFootballData(
  apiKey: string,
): Promise<NormalizedMatch[]> {
  const url = buildUrl(FOOTBALL_DATA_WC_ENDPOINT, { status: "LIVE" });
  const data = await fetchJson<FootballDataResponse>(url, {
    "X-Auth-Token": apiKey,
  });

  return (data.matches ?? []).map(normalizeFootballDataMatch).filter(isLiveStatus);
}

async function fetchWindowFromBzzoiro(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<NormalizedMatch[]> {
  const leagueId = String([...getBzzoiroLeagueIds()][0] ?? 27);
  const url = buildUrl(BZZOIRO_EVENTS_ENDPOINT, {
    league_id: leagueId,
    date_from: dateFrom,
    date_to: dateTo,
  });
  const data = await fetchJson<BzzoiroEventsResponse>(url, {
    Authorization: `Token ${apiKey}`,
  });

  return (data.results ?? data.events ?? [])
    .filter(isAllowedBzzoiroLeague)
    .map(normalizeBzzoiroMatch);
}

async function fetchWindowFromFootballData(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<NormalizedMatch[]> {
  const url = buildUrl(FOOTBALL_DATA_WC_ENDPOINT, { dateFrom, dateTo });
  const data = await fetchJson<FootballDataResponse>(url, {
    "X-Auth-Token": apiKey,
  });

  return (data.matches ?? []).map(normalizeFootballDataMatch);
}

function chooseBestMatch(matches: NormalizedMatch[]): NormalizedMatch | null {
  const valid = matches.filter((match) => match.eventDate);
  if (!valid.length) return matches[0] ?? null;

  const now = Date.now();
  const live = valid.find((match) => match.status === "LIVE");
  if (live) return live;

  const upcoming = valid
    .filter((match) => {
      const kickoff = new Date(match.eventDate as string).getTime();
      return match.status === "SCHEDULED" && kickoff >= now;
    })
    .sort(
      (a, b) =>
        new Date(a.eventDate as string).getTime() -
        new Date(b.eventDate as string).getTime(),
    );
  if (upcoming[0]) return upcoming[0];

  const finished = valid
    .filter((match) => {
      const kickoff = new Date(match.eventDate as string).getTime();
      return match.status === "FINISHED" && kickoff <= now;
    })
    .sort(
      (a, b) =>
        new Date(b.eventDate as string).getTime() -
        new Date(a.eventDate as string).getTime(),
    );
  if (finished[0]) return finished[0];

  return valid.sort(
    (a, b) =>
      Math.abs(new Date(a.eventDate as string).getTime() - now) -
      Math.abs(new Date(b.eventDate as string).getTime() - now),
  )[0];
}

function makeCachedResponse(
  body: FifaLiveBody,
  status: number,
  ttlMs: number,
): CachedResponse {
  return {
    body,
    status,
    expiresAt: Date.now() + ttlMs,
  };
}

async function resolveFifaLiveResponse(): Promise<CachedResponse> {
  const primaryKey = getPrimaryApiKey();
  const fallbackKey = getFallbackApiKey();

  if (!primaryKey && !fallbackKey) {
    return makeCachedResponse(
      { error: "FIFA score service is not configured." },
      503,
      ERROR_CACHE_MS,
    );
  }

  const liveCalls: Promise<ProviderResult<NormalizedMatch[]>>[] = [];
  if (primaryKey) {
    liveCalls.push(
      providerCall("bzzoiro-sports", () => fetchLiveFromBzzoiro(primaryKey)),
    );
  }
  if (fallbackKey) {
    liveCalls.push(
      providerCall("football-data", () =>
        fetchLiveFromFootballData(fallbackKey),
      ),
    );
  }

  const liveResults = await Promise.all(liveCalls);
  const liveMatches = liveResults.flatMap((result) =>
    result.ok ? result.data : [],
  );
  const liveMatch = chooseBestMatch(liveMatches);
  if (liveMatch) {
    return makeCachedResponse({ match: liveMatch }, 200, LIVE_CACHE_MS);
  }

  const now = new Date();
  const dateFrom = formatDateOnly(
    new Date(now.getTime() - MATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
  );
  const dateTo = formatDateOnly(
    new Date(now.getTime() + MATCH_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000),
  );

  const windowCalls: Promise<ProviderResult<NormalizedMatch[]>>[] = [];
  if (primaryKey) {
    windowCalls.push(
      providerCall("bzzoiro-sports", () =>
        fetchWindowFromBzzoiro(primaryKey, dateFrom, dateTo),
      ),
    );
  }
  if (fallbackKey) {
    windowCalls.push(
      providerCall("football-data", () =>
        fetchWindowFromFootballData(fallbackKey, dateFrom, dateTo),
      ),
    );
  }

  const windowResults = await Promise.all(windowCalls);
  const windowMatches = windowResults.flatMap((result) =>
    result.ok ? result.data : [],
  );
  const closestMatch = chooseBestMatch(windowMatches);
  if (closestMatch) {
    return makeCachedResponse({ match: closestMatch }, 200, FALLBACK_CACHE_MS);
  }

  const providerSucceeded = [...liveResults, ...windowResults].some(
    (result) => result.ok,
  );
  if (!providerSucceeded) {
    return makeCachedResponse(
      { error: "FIFA score service is temporarily unavailable." },
      503,
      ERROR_CACHE_MS,
    );
  }

  return makeCachedResponse(
    { match: buildNoLiveMatch() },
    200,
    FALLBACK_CACHE_MS,
  );
}

async function getCachedFifaLiveResponse(): Promise<CachedResponse> {
  const now = Date.now();
  if (cachedResponse && cachedResponse.expiresAt > now) {
    return cachedResponse;
  }

  if (!inFlightResponse) {
    inFlightResponse = resolveFifaLiveResponse().finally(() => {
      inFlightResponse = null;
    });
  }

  cachedResponse = await inFlightResponse;
  return cachedResponse;
}

export async function GET(request: Request) {
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: LIVE_HEADERS },
    );
  }

  const ip = getClientIp(request);
  const rateLimit = enforceRateLimit(
    `fifa_live:${ip}`,
    FIFA_LIVE_RATE_LIMIT,
    FIFA_LIVE_RATE_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          ...LIVE_HEADERS,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const response = await getCachedFifaLiveResponse();
  return NextResponse.json(response.body, {
    status: response.status,
    headers: LIVE_HEADERS,
  });
}
