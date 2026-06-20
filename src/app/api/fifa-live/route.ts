import { NextResponse } from "next/server";
import {
  enforceRateLimit,
  getClientIp,
  isTrustedSameOriginRequest,
} from "@/lib/apiSecurity";
import { resolveFifaLiveMatch } from "@/lib/fifaData";

const FIFA_LIVE_RATE_LIMIT = 30;
const FIFA_LIVE_RATE_WINDOW_MS = 60 * 1_000;
const LIVE_CACHE_MS = 20_000;
const FALLBACK_CACHE_MS = 60_000;
const ERROR_CACHE_MS = 10_000;

const LIVE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Origin, Referer, Sec-Fetch-Site, Host",
};

type CachedResponse = {
  body: { match: unknown } | { error: string };
  status: number;
  expiresAt: number;
};

let cachedResponse: CachedResponse | null = null;
let inFlightResponse: Promise<CachedResponse> | null = null;

function makeCachedResponse(
  body: CachedResponse["body"],
  status: number,
  ttlMs: number,
): CachedResponse {
  return {
    body,
    status,
    expiresAt: Date.now() + ttlMs,
  };
}

async function getCachedFifaLiveResponse(): Promise<CachedResponse> {
  const now = Date.now();
  if (cachedResponse && cachedResponse.expiresAt > now) {
    return cachedResponse;
  }

  if (!inFlightResponse) {
    inFlightResponse = resolveFifaLiveMatch()
      .then((response) => {
        const ttl =
          response.status === 503
            ? ERROR_CACHE_MS
            : "match" in response.body &&
                (response.body.match as { status?: string }).status === "LIVE"
              ? LIVE_CACHE_MS
              : FALLBACK_CACHE_MS;
        return makeCachedResponse(response.body, response.status, ttl);
      })
      .finally(() => {
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
