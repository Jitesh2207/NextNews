import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  getClientIp,
  isTrustedSameOriginRequest,
} from "@/lib/apiSecurity";
import {
  buildDateRange,
  fetchAllFifaMatches,
  formatDateOnly,
  matchOnDate,
  sortMatchesForDisplay,
  type NormalizedMatch,
} from "@/lib/fifaData";

const FIFA_MATCHES_RATE_LIMIT = 30;
const FIFA_MATCHES_RATE_WINDOW_MS = 60 * 1_000;
const MATCHES_CACHE_MS = 20_000;
const ERROR_CACHE_MS = 10_000;

const MATCHES_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Origin, Referer, Sec-Fetch-Site, Host",
};

type MatchesBody =
  | {
      matches: NormalizedMatch[];
      liveMatches: NormalizedMatch[];
      dates: string[];
      selectedDate: string;
    }
  | { error: string };

type CachedResponse = {
  body: MatchesBody;
  status: number;
  expiresAt: number;
  dateKey: string;
};

let cachedResponse: CachedResponse | null = null;
let inFlightResponse: Promise<CachedResponse> | null = null;
let inFlightDateKey: string | null = null;

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function filterByDate(
  matches: NormalizedMatch[],
  dateStr: string,
): NormalizedMatch[] {
  return sortMatchesForDisplay(
    matches.filter((match) => matchOnDate(match, dateStr)),
  );
}

async function resolveFifaMatchesResponse(
  selectedDate: string,
): Promise<CachedResponse> {
  const result = await fetchAllFifaMatches();

  if (!result.ok) {
    return {
      body: { error: result.error },
      status: result.status,
      expiresAt: Date.now() + ERROR_CACHE_MS,
      dateKey: selectedDate,
    };
  }

  const dates = buildDateRange();
  const safeDate = dates.includes(selectedDate)
    ? selectedDate
    : formatDateOnly(new Date());

  const dateMatches = filterByDate(result.matches, safeDate);
  const liveForDate = result.liveMatches.filter((match) =>
    matchOnDate(match, safeDate),
  );

  return {
    body: {
      matches: dateMatches,
      liveMatches: sortMatchesForDisplay(liveForDate),
      dates,
      selectedDate: safeDate,
    },
    status: 200,
    expiresAt: Date.now() + MATCHES_CACHE_MS,
    dateKey: safeDate,
  };
}

async function getCachedFifaMatchesResponse(
  selectedDate: string,
): Promise<CachedResponse> {
  const now = Date.now();

  if (
    cachedResponse &&
    cachedResponse.expiresAt > now &&
    cachedResponse.status === 200 &&
    cachedResponse.dateKey === selectedDate
  ) {
    return cachedResponse;
  }

  if (!inFlightResponse || inFlightDateKey !== selectedDate) {
    inFlightDateKey = selectedDate;
    inFlightResponse = resolveFifaMatchesResponse(selectedDate).finally(() => {
      inFlightResponse = null;
      inFlightDateKey = null;
    });
  }

  cachedResponse = await inFlightResponse;
  return cachedResponse;
}

export async function GET(request: Request) {
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: MATCHES_HEADERS },
    );
  }

  const ip = getClientIp(request);
  const rateLimit = enforceRateLimit(
    `fifa_matches:${ip}`,
    FIFA_MATCHES_RATE_LIMIT,
    FIFA_MATCHES_RATE_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          ...MATCHES_HEADERS,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get("date")?.trim() ?? "";
  const selectedDate =
    rawDate && isValidDate(rawDate) ? rawDate : formatDateOnly(new Date());

  const response = await getCachedFifaMatchesResponse(selectedDate);
  return NextResponse.json(response.body, {
    status: response.status,
    headers: MATCHES_HEADERS,
  });
}
