import { NextResponse } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/apiSecurity";
import { fetchCategoryNews } from "@/lib/categoryNews";

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req);
    const ratelimit = enforceRateLimit(
      `category_news_api_${ip}`,
      60,
      60 * 1000,
    );

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
    const category = searchParams.get("category")?.trim();

    if (!category) {
      return NextResponse.json(
        { error: "Missing category parameter" },
        { status: 400 },
      );
    }

    const data = await fetchCategoryNews({
      category,
      regionId: searchParams.get("region"),
      country: searchParams.get("country"),
      page: parsePositiveInt(searchParams.get("page"), 1),
      pageSize: parsePositiveInt(searchParams.get("pageSize"), 20),
      revalidate: 0,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Category News API Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching category news." },
      { status: 500 },
    );
  }
}
