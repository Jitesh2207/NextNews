import { NextResponse } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/apiSecurity";
import { fetchFifaNews } from "@/lib/fifaNews";

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const ratelimit = enforceRateLimit(`fifa_news_api_${ip}`, 60, 60 * 1000);

    if (!ratelimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(ratelimit.retryAfterSeconds) },
        },
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 40);

    const data = await fetchFifaNews(page, pageSize);

    return NextResponse.json(
      { articles: data.articles, hasMore: data.hasMore },
      { status: 200 },
    );
  } catch (error) {
    console.error("FIFA News API Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching FIFA news." },
      { status: 500 },
    );
  }
}
