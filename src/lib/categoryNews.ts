import { getExploreRegion } from "@/lib/explore";
import {
  getCategoryDisplayName,
  getCategorySearchConfig,
  isNewsApiTopHeadlineCategory,
} from "@/lib/newsCategories";

export interface NewsApiArticle {
  source?: { id?: string | null; name?: string };
  author?: string | null;
  title?: string;
  description?: string | null;
  content?: string | null;
  url?: string;
  urlToImage?: string | null;
  publishedAt?: string;
}

export interface CategoryNewsResponse {
  articles?: NewsApiArticle[];
  [key: string]: unknown;
}

interface FetchCategoryNewsOptions {
  category: string;
  regionId?: string | null;
  country?: string | null;
  page?: number;
  pageSize?: number;
  revalidate?: number;
}

function getPositiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export async function fetchCategoryNews({
  category,
  regionId,
  country,
  page = 1,
  pageSize = 20,
  revalidate = 300,
}: FetchCategoryNewsOptions): Promise<CategoryNewsResponse> {
  const baseUrl = process.env.NEWS_API_BASE_URL || "https://newsapi.org/v2";
  const apiKey = process.env.NEWS_API_KEY4 || process.env.NEWS_API_KEY2;

  if (!apiKey) {
    return { articles: [] };
  }

  const safePage = getPositiveNumber(page, 1);
  const safePageSize = Math.min(getPositiveNumber(pageSize, 20), 100);
  const customCategory = getCategorySearchConfig(category);
  const region = regionId ? getExploreRegion(regionId) : null;
  const params = new URLSearchParams({
    page: String(safePage),
    pageSize: String(safePageSize),
    apiKey,
  });

  let path = "/everything";

  if (customCategory) {
    const scopedQuery =
      region && region.id !== "world"
        ? `(${customCategory.query}) AND ${region.topicQuery}`
        : customCategory.query;

    params.set("q", scopedQuery);
    params.set("sortBy", "publishedAt");

    if (customCategory.searchIn) {
      params.set("searchIn", customCategory.searchIn);
    }
  } else if (region) {
    if (region.country) {
      path = "/top-headlines";
      params.set("country", region.country);
      params.set("category", category);
    } else {
      const categoryQuery = getCategoryDisplayName(category);
      const scopedQuery =
        region.id !== "world"
          ? `(${categoryQuery}) AND ${region.topicQuery}`
          : categoryQuery;

      params.set("q", scopedQuery);
      params.set("sortBy", "publishedAt");
    }
  } else if (isNewsApiTopHeadlineCategory(category)) {
    path = "/top-headlines";
    params.set("country", country || "us");
    params.set("category", category);
  } else {
    params.set("q", getCategoryDisplayName(category));
    params.set("sortBy", "publishedAt");
  }

  const response = await fetch(`${baseUrl}${path}?${params.toString()}`, {
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch news for category: ${category}`);
  }

  return response.json();
}
