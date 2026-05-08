"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DEFAULT_PERSONALIZATION_TOPICS,
  slugifyPersonalizationTopic,
} from "@/lib/personalizationTopics";

const CATEGORIES = [...DEFAULT_PERSONALIZATION_TOPICS];

export default function MobileCategoryRow() {
  const pathname = usePathname();

  const isCategoryPage =
    pathname === "/" || pathname.startsWith("/categories/");

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
        {CATEGORIES.map((category) => {
          const isTopHeadlines = category === "Top Headlines";
          const slug = isTopHeadlines ? "" : slugifyPersonalizationTopic(category);
          const href = isTopHeadlines ? "/" : `/categories/${slug}`;
          const isActive = isTopHeadlines
            ? pathname === "/"
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
              {category}

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
        })}
      </div>
    </div>
  );
}