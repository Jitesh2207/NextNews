"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  DEFAULT_PERSONALIZATION_TOPICS,
  slugifyPersonalizationTopic,
} from "@/lib/personalizationTopics";

const CATEGORIES = [
  "Top Headlines",
  "India",
  ...DEFAULT_PERSONALIZATION_TOPICS.filter((t) => t !== "Top Headlines"),
];

const INDIAN_TADKA_SOURCES = [
  { name: "India Today", href: "/news/indian-tadka/india-today" },
  { name: "Times of India", href: "/news/indian-tadka/times-of-india" },
  { name: "Hindustan Times", href: "/news/indian-tadka/hindustan-times" },
  { name: "Indian Express", href: "/news/indian-tadka/indian-express" },
  { name: "The Hindu", href: "/news/indian-tadka/the-hindu" },
];

export default function MobileCategoryRow() {
  const pathname = usePathname();

  const isIndianTadka = pathname.startsWith("/news/indian-tadka");
  const isCategoryPage =
    pathname === "/" || pathname.startsWith("/categories/") || isIndianTadka;

  if (!isCategoryPage) return null;

  return (
    <div
      className="sticky top-[73px] z-[21] md:hidden"
      style={{
        backdropFilter: "blur(16px) saturate(1.6)",
        WebkitBackdropFilter: "blur(16px) saturate(1.6)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--card) 82%, transparent) 0%, color-mix(in srgb, var(--card) 70%, transparent) 100%)",
        borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
      }}
    >
      <div className="scrollbar-hide flex items-center gap-5 overflow-x-auto px-4 py-0">
        {isIndianTadka ? (
          <>
            <Link
              href="/"
              className="group relative shrink-0 whitespace-nowrap py-2.5 transition-all duration-200 active:scale-[0.97] flex items-center gap-1"
              style={{
                fontSize: "11.5px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: "var(--primary)",
              }}
            >
              <ChevronLeft size={14} />
              Back
            </Link>
            
            <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 shrink-0" />

            {INDIAN_TADKA_SOURCES.map((source) => {
              const isActive = pathname === source.href || pathname.startsWith(`${source.href}/`);

              return (
                <Link
                  key={source.name}
                  href={source.href}
                  className="group relative shrink-0 whitespace-nowrap py-2.5 transition-all duration-200 active:scale-[0.97]"
                  style={{
                    fontSize: "11.5px",
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: isActive ? "0.03em" : "0.02em",
                    color: isActive
                      ? "var(--foreground)"
                      : "color-mix(in srgb, var(--muted-foreground) 85%, transparent)",
                  }}
                >
                  {source.name}

                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 rounded-full"
                      style={{
                        height: "2px",
                        background:
                          "linear-gradient(90deg, var(--foreground) 0%, color-mix(in srgb, var(--foreground) 60%, transparent) 100%)",
                        boxShadow: "0 0 6px color-mix(in srgb, var(--foreground) 40%, transparent)",
                      }}
                    />
                  )}
                  {!isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      style={{
                        height: "1.5px",
                        background:
                          "color-mix(in srgb, var(--muted-foreground) 35%, transparent)",
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </>
        ) : (
          CATEGORIES.map((category) => {
            const isTopHeadlines = category === "Top Headlines";
            const isIndia = category === "India";
            const slug = isTopHeadlines || isIndia ? "" : slugifyPersonalizationTopic(category);
            
            let href = `/categories/${slug}`;
            if (isTopHeadlines) href = "/";
            if (isIndia) href = "/news/indian-tadka/india-today";

            const isActive = isTopHeadlines
              ? pathname === "/"
              : isIndia
                ? pathname.startsWith("/news/indian-tadka")
                : pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                key={category}
                href={href}
                className="group relative shrink-0 whitespace-nowrap py-2.5 transition-all duration-200 active:scale-[0.97]"
                style={{
                  fontSize: "11.5px",
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: isActive ? "0.03em" : "0.02em",
                  color: isActive
                    ? "var(--foreground)"
                    : "color-mix(in srgb, var(--muted-foreground) 85%, transparent)",
                }}
              >
                {isIndia ? (
                  <span className="flex items-center gap-1.5">
                    <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-green-500 bg-clip-text text-transparent font-bold">
                      India
                    </span>
                  </span>
                ) : (
                  category
                )}

                {/* Active underline */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 rounded-full"
                    style={{
                      height: "2px",
                      background:
                        "linear-gradient(90deg, var(--foreground) 0%, color-mix(in srgb, var(--foreground) 60%, transparent) 100%)",
                      boxShadow: "0 0 6px color-mix(in srgb, var(--foreground) 40%, transparent)",
                    }}
                  />
                )}

                {/* Hover underline for inactive */}
                {!isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{
                      height: "1.5px",
                      background:
                        "color-mix(in srgb, var(--muted-foreground) 35%, transparent)",
                    }}
                  />
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}