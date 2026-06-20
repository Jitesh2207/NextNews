import { fetchCategoryNews, type NewsApiArticle } from "@/lib/categoryNews";

const FOOTBALL_KEYWORDS = [
  "football",
  "soccer",
  "fifa",
  "world cup",
  "premier league",
  "champions league",
  "la liga",
  "bundesliga",
  "serie a",
  "mls",
  "uefa",
  "goalkeeper",
  "striker",
  "penalty",
  "transfer",
  "manager",
  "midfielder",
];

function isFootballArticle(article: NewsApiArticle): boolean {
  const haystack = [article.title, article.description, article.content]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return FOOTBALL_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function filterFootballArticles(
  articles: NewsApiArticle[],
): NewsApiArticle[] {
  return articles.filter(isFootballArticle);
}

export async function fetchFifaNews(page = 1, pageSize = 20) {
  const data = await fetchCategoryNews({
    category: "sports",
    page,
    pageSize: Math.max(pageSize * 2, 40),
    revalidate: 300,
  });

  const articles = filterFootballArticles(data.articles ?? []);

  return {
    articles: articles.slice(0, pageSize),
    hasMore: articles.length >= pageSize,
  };
}
