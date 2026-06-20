const BZZOIRO_LIVE_ENDPOINT = "https://sports.bzzoiro.com/api/v2/events/live/";
const BZZOIRO_EVENTS_ENDPOINT = "https://sports.bzzoiro.com/api/v2/events/";
const FOOTBALL_DATA_WC_ENDPOINT =
  "https://api.football-data.org/v4/competitions/WC/matches";

export const MATCH_LOOKBACK_DAYS = 7;
export const MATCH_LOOKAHEAD_DAYS = 14;
const PROVIDER_TIMEOUT_MS = 8_000;

export type MatchStatus = "LIVE" | "SCHEDULED" | "FINISHED" | "NO_LIVE_MATCH";
export type ProviderName = "bzzoiro-sports" | "football-data";

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
  group?: string | null;
  possession?: { home: number | null; away: number | null };
  shots?: { home: number | null; away: number | null; onTarget: { home: number | null; away: number | null } };
  formations?: { home: string | null; away: string | null };
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
  group?: string | null;
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

export function getPrimaryApiKey(): string {
  return process.env.FIFA_API_KEY?.trim() ?? "";
}

export function getFallbackApiKey(): string {
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

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const TEAM_IDENTITY_ALIASES: Record<string, string> = {
  "cote d ivoire": "ivory coast",
  "cote divoire": "ivory coast",
  "cotedivoire": "ivory coast",
  "ivory coast": "ivory coast",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "south korea": "south korea",
  "usa": "united states",
  "u s a": "united states",
  "united states": "united states",
  "united states of america": "united states",
};

function normalizeTeamIdentity(team: string): string {
  const normalized = team
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return TEAM_IDENTITY_ALIASES[normalized] ?? normalized;
}

function matchKickoffIdentity(match: NormalizedMatch): string {
  if (!match.eventDate) return "";
  const kickoff = new Date(match.eventDate);
  if (Number.isNaN(kickoff.getTime())) return "";
  return kickoff.toISOString().slice(0, 16);
}

function matchIdentity(match: NormalizedMatch): string {
  const teams = [
    normalizeTeamIdentity(match.homeTeam),
    normalizeTeamIdentity(match.awayTeam),
  ].sort();

  return [matchKickoffIdentity(match), ...teams].join("|");
}

function matchPriority(match: NormalizedMatch): number {
  const statusPriority: Record<MatchStatus, number> = {
    LIVE: 400,
    FINISHED: 300,
    SCHEDULED: 200,
    NO_LIVE_MATCH: 0,
  };
  const sourcePriority: Record<NormalizedMatch["source"], number> = {
    "bzzoiro-sports": 30,
    "football-data": 20,
    "no-live": 0,
  };
  const detailScore =
    (typeof match.minute === "number" ? 8 : 0) +
    (match.homeLogo ? 3 : 0) +
    (match.awayLogo ? 3 : 0) +
    (match.stage ? 1 : 0);

  return statusPriority[match.status] + sourcePriority[match.source] + detailScore;
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
    group: null,
    possession: { home: null, away: null },
    shots: { home: null, away: null, onTarget: { home: null, away: null } },
    formations: { home: null, away: null },
  };
}

function cleanGroupText(group: string | null | undefined): string | null {
  if (!group) return null;
  const clean = group.replace(/_/g, " ").trim();
  return clean
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
    group: cleanGroupText(match.group),
    possession: { home: null, away: null },
    shots: { home: null, away: null, onTarget: { home: null, away: null } },
    formations: { home: null, away: null },
  };
}

export function buildNoLiveMatch(): NormalizedMatch {
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
    group: null,
    possession: { home: null, away: null },
    shots: { home: null, away: null, onTarget: { home: null, away: null } },
    formations: { home: null, away: null },
  };
}

export function getMatchDisplayName(
  match: {
    competition?: string;
    stage?: string;
    homeTeam?: string;
    awayTeam?: string;
    group?: string | null;
  } | null | undefined,
): string {
  if (!match) return "FIFA World Cup 2026";

  if (match.group) {
    return match.group;
  }

  // Check if stage is a known knockout stage or descriptive stage
  // (e.g. not "Group Stage", "Live", "No live match right now")
  const stage = match.stage;
  const stageLower = stage?.toLowerCase() ?? "";
  if (
    stage &&
    !stageLower.includes("group stage") &&
    !stageLower.includes("live") &&
    !stageLower.includes("no live match") &&
    !stageLower.includes("half") &&
    !stageLower.includes("time")
  ) {
    // Return formatted stage name, e.g. "ROUND_OF_16" -> "Round of 16"
    return stage
      .replace(/_/g, " ")
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Fallback to match name
  if (match.homeTeam && match.awayTeam && match.homeTeam !== "-" && match.awayTeam !== "-") {
    return `${match.homeTeam} vs ${match.awayTeam}`;
  }

  // Final fallback
  return match.competition || "FIFA World Cup 2026";
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
    console.warn(`FIFA provider failed: ${provider}: ${message}`);
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

function dedupeMatches(matches: NormalizedMatch[]): NormalizedMatch[] {
  const byIdentity = new Map<string, NormalizedMatch>();

  for (const match of matches) {
    const key = matchIdentity(match);
    const existing = byIdentity.get(key);
    if (!existing || matchPriority(match) > matchPriority(existing)) {
      byIdentity.set(key, match);
    }
  }

  return [...byIdentity.values()];
}

export function chooseBestMatch(matches: NormalizedMatch[]): NormalizedMatch | null {
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

export function matchOnDate(match: NormalizedMatch, dateStr: string): boolean {
  if (!match.eventDate) return false;
  return formatDateOnly(new Date(match.eventDate)) === dateStr;
}

export function sortMatchesForDisplay(
  matches: NormalizedMatch[],
): NormalizedMatch[] {
  const statusOrder: Record<MatchStatus, number> = {
    LIVE: 0,
    SCHEDULED: 1,
    FINISHED: 2,
    NO_LIVE_MATCH: 3,
  };

  return [...matches].sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    const aTime = a.eventDate ? new Date(a.eventDate).getTime() : 0;
    const bTime = b.eventDate ? new Date(b.eventDate).getTime() : 0;

    if (a.status === "FINISHED") return bTime - aTime;
    return aTime - bTime;
  });
}

export function buildDateRange(): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = -MATCH_LOOKBACK_DAYS; offset <= MATCH_LOOKAHEAD_DAYS; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    dates.push(formatDateOnly(d));
  }

  return dates;
}

export type FifaFetchResult =
  | { ok: true; matches: NormalizedMatch[]; liveMatches: NormalizedMatch[] }
  | { ok: false; error: string; status: number };

export async function fetchAllFifaMatches(): Promise<FifaFetchResult> {
  const primaryKey = getPrimaryApiKey();
  const fallbackKey = getFallbackApiKey();

  if (!primaryKey && !fallbackKey) {
    return {
      ok: false,
      error: "FIFA score service is not configured.",
      status: 503,
    };
  }

  const now = new Date();
  const dateFrom = formatDateOnly(
    new Date(now.getTime() - MATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
  );
  const dateTo = formatDateOnly(
    new Date(now.getTime() + MATCH_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000),
  );

  const liveCalls: Promise<ProviderResult<NormalizedMatch[]>>[] = [];
  const windowCalls: Promise<ProviderResult<NormalizedMatch[]>>[] = [];

  if (primaryKey) {
    liveCalls.push(
      providerCall("bzzoiro-sports", () => fetchLiveFromBzzoiro(primaryKey)),
    );
    windowCalls.push(
      providerCall("bzzoiro-sports", () =>
        fetchWindowFromBzzoiro(primaryKey, dateFrom, dateTo),
      ),
    );
  }
  if (fallbackKey) {
    liveCalls.push(
      providerCall("football-data", () =>
        fetchLiveFromFootballData(fallbackKey),
      ),
    );
    windowCalls.push(
      providerCall("football-data", () =>
        fetchWindowFromFootballData(fallbackKey, dateFrom, dateTo),
      ),
    );
  }

  const [liveResults, windowResults] = await Promise.all([
    Promise.all(liveCalls),
    Promise.all(windowCalls),
  ]);

  const providerSucceeded = [...liveResults, ...windowResults].some(
    (result) => result.ok,
  );

  if (!providerSucceeded) {
    return {
      ok: false,
      error: "FIFA score service is temporarily unavailable.",
      status: 503,
    };
  }

  const liveMatches = dedupeMatches(
    liveResults.flatMap((result) => (result.ok ? result.data : [])),
  );
  const windowMatches = dedupeMatches(
    windowResults.flatMap((result) => (result.ok ? result.data : [])),
  );

  const merged = dedupeMatches([...liveMatches, ...windowMatches]);

  return { ok: true, matches: merged, liveMatches };
}

export async function resolveFifaLiveMatch(): Promise<{
  body: { match: NormalizedMatch } | { error: string };
  status: number;
}> {
  const result = await fetchAllFifaMatches();

  if (!result.ok) {
    return { body: { error: result.error }, status: result.status };
  }

  const liveMatch = chooseBestMatch(result.liveMatches);
  if (liveMatch) {
    return { body: { match: liveMatch }, status: 200 };
  }

  const closestMatch = chooseBestMatch(result.matches);
  if (closestMatch) {
    return { body: { match: closestMatch }, status: 200 };
  }

  return { body: { match: buildNoLiveMatch() }, status: 200 };
}
