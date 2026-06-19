import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  getClientIp,
  isTrustedSameOriginRequest,
} from "@/lib/apiSecurity";

// ─── Constants ────────────────────────────────────────────────────────────────
const BZZOIRO_ENDPOINT = "https://sports.bzzoiro.com/api/v2/events/live/";
const FOOTBALL_DATA_ENDPOINT = "https://api.football-data.org/v4/matches";

/** Allow up to 30 requests per minute per IP. */
const FIFA_LIVE_RATE_LIMIT = 30;
const FIFA_LIVE_RATE_WINDOW_MS = 60 * 1_000;

// ─── Types ────────────────────────────────────────────────────────────────────
type MatchStatus = "LIVE" | "SCHEDULED" | "FINISHED" | "NO_LIVE_MATCH";

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
  /** "bzzoiro-sports" | "football-data" | "no-live" */
  source: string;
  message?: string;
};

// sports.bzzoiro.com live event shape
type BzzoiroEventLive = {
  id: number;
  league_id: number | null;
  league_name: string | null;
  home_team_id: number | null;
  home_team: string;
  away_team_id: number | null;
  away_team: string;
  event_date: string;
  status: "notstarted" | "inprogress" | "penalties" | "finished";
  period: "1st_half" | "halftime" | "2nd_half" | "extra_time" | "FT" | null;
  current_minute: number | null;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  live_websocket: boolean;
  last_updated: string;
};

type BzzoiroLiveResponse = {
  count: number;
  events: BzzoiroEventLive[];
};

// football-data.org response shape
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
};

type FootballDataResponse = {
  matches?: FootballDataMatch[];
  message?: string;
};

// ─── Env key helpers ──────────────────────────────────────────────────────────
function getPrimaryApiKey(): string {
  return process.env.FIFA_API_KEY?.trim() ?? "";
}
function getFallbackApiKey(): string {
  return process.env.FIFA_API_KEY2?.trim() ?? "";
}

// ─── Normalizers ──────────────────────────────────────────────────────────────
function pickBestBzzoiroMatch(events: BzzoiroEventLive[]): BzzoiroEventLive | null {
  if (!events.length) return null;
  const live = events.find(
    (e) => e.status === "inprogress" || e.status === "penalties",
  );
  return live ?? events[0];
}

function formatBzzoiroPeriod(period: string | null): string {
  if (!period) return "Live";
  const p = period.toLowerCase();
  if (p === "1st_half") return "1st Half";
  if (p === "halftime") return "Half Time";
  if (p === "2nd_half") return "2nd Half";
  if (p === "extra_time") return "Extra Time";
  if (p === "ft") return "Full Time";
  return period.replace(/_/g, " ");
}

function normalizeBzzoiroMatch(m: BzzoiroEventLive): NormalizedMatch {
  const isFinished = m.status === "finished";

  return {
    status: isFinished ? "FINISHED" : "LIVE",
    competition: m.league_name?.trim() || "Football",
    stage: formatBzzoiroPeriod(m.period),
    minute: m.current_minute ?? null,
    homeTeam: m.home_team?.trim() || "Home",
    awayTeam: m.away_team?.trim() || "Away",
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
    homeLogo: m.home_team_id
      ? `https://sports.bzzoiro.com/img/team/${m.home_team_id}/?bg=transparent`
      : null,
    awayLogo: m.away_team_id
      ? `https://sports.bzzoiro.com/img/team/${m.away_team_id}/?bg=transparent`
      : null,
    updatedAt: new Date().toISOString(),
    source: "bzzoiro-sports",
  };
}

function normalizeFootballDataMatch(m: FootballDataMatch): NormalizedMatch {
  const score =
    m.score?.currentPeriod ??
    m.score?.regularTime ??
    m.score?.fullTime;
  const isFinished = m.status === "FINISHED";

  return {
    status: isFinished ? "FINISHED" : "LIVE",
    competition: m.competition?.name?.trim() || "Football",
    stage: m.stage?.replace(/_/g, " ").trim() || "Live",
    minute: m.minute ?? null,
    homeTeam: m.homeTeam?.name?.trim() || "Home",
    awayTeam: m.awayTeam?.name?.trim() || "Away",
    homeScore: score?.home ?? 0,
    awayScore: score?.away ?? 0,
    homeLogo: m.homeTeam?.crest ?? null,
    awayLogo: m.awayTeam?.crest ?? null,
    updatedAt: new Date().toISOString(),
    source: "football-data",
  };
}

/** Returned when no live match is currently active from any provider. */
function buildNoLiveMatch(): NormalizedMatch {
  return {
    status: "NO_LIVE_MATCH",
    competition: "FIFA World Cup 2026",
    stage: "No live match right now",
    minute: null,
    homeTeam: "—",
    awayTeam: "—",
    homeScore: 0,
    awayScore: 0,
    homeLogo: null,
    awayLogo: null,
    updatedAt: new Date().toISOString(),
    source: "no-live",
    message: "No live match in progress. Check back during match times.",
  };
}

// ─── Provider fetchers ────────────────────────────────────────────────────────
async function fetchFromBzzoiro(
  apiKey: string,
): Promise<NormalizedMatch | null> {
  const res = await fetch(BZZOIRO_ENDPOINT, {
    headers: { "Authorization": `Token ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await res.json().catch(() => null)) as BzzoiroLiveResponse | null;
  if (!res.ok) {
    throw new Error(
      `sports.bzzoiro.com responded ${res.status}: ${JSON.stringify(data)}`,
    );
  }

  const events = data?.events ?? [];
  const best = pickBestBzzoiroMatch(events);
  return best ? normalizeBzzoiroMatch(best) : null;
}

async function fetchFromFootballData(
  apiKey: string,
): Promise<NormalizedMatch | null> {
  const url = `${FOOTBALL_DATA_ENDPOINT}?status=LIVE`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await res.json().catch(() => null)) as FootballDataResponse | null;
  if (!res.ok) {
    throw new Error(
      `football-data responded ${res.status}: ${data?.message ?? "unknown error"}`,
    );
  }

  const match = data?.matches?.[0];
  return match ? normalizeFootballDataMatch(match) : null;
}

// ─── Shared response headers ──────────────────────────────────────────────────
const LIVE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Origin, Referer, Sec-Fetch-Site, Host",
};

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  // 1. Same-origin guard – only calls from the same site are allowed
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { Vary: "Origin, Referer, Sec-Fetch-Site, Host" } },
    );
  }

  // 2. Per-IP rate limiting
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
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "Cache-Control": "private, no-store",
          Vary: "Origin, Referer, Sec-Fetch-Site, Host",
        },
      },
    );
  }

  const primaryKey = getPrimaryApiKey();
  const fallbackKey = getFallbackApiKey();

  // 3. If no API keys are configured at all, return a clean "no live match" state
  if (!primaryKey && !fallbackKey) {
    return NextResponse.json(
      {
        match: buildNoLiveMatch(),
        warning: "No FIFA_API_KEY or FIFA_API_KEY2 configured in environment variables.",
      },
      { status: 200, headers: LIVE_HEADERS },
    );
  }

  const errors: string[] = [];

  // 4. Try primary provider (sports.bzzoiro.com)
  if (primaryKey) {
    try {
      const match = await fetchFromBzzoiro(primaryKey);
      if (match) {
        return NextResponse.json({ match }, { status: 200, headers: LIVE_HEADERS });
      }
      // Provider returned OK but no live match — don't count this as an error
    } catch (err) {
      errors.push(
        `[bzzoiro-sports] ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  // 5. Try fallback provider (football-data.org)
  if (fallbackKey) {
    try {
      const match = await fetchFromFootballData(fallbackKey);
      if (match) {
        return NextResponse.json({ match }, { status: 200, headers: LIVE_HEADERS });
      }
    } catch (err) {
      errors.push(
        `[football-data] ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  // 6. Both providers succeeded but no live match right now
  //    (or both errored — we still return 200 so the UI shows gracefully)
  return NextResponse.json(
    {
      match: buildNoLiveMatch(),
      ...(errors.length ? { providerErrors: errors } : {}),
    },
    { status: 200, headers: LIVE_HEADERS },
  );
}
