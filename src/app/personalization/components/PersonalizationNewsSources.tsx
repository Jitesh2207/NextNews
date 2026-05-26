"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import SourceLogo from "../../components/sourceLogo";
import { getSourceLogoSrc } from "@/lib/newsImage";

export const PERSONALIZATION_DEFAULT_SOURCE_SELECTION = [
  "NewsAPI Top Headlines",
];
export const PERSONALIZATION_MAX_SOURCES = 5;

type NewsSourceOption = {
  id: string;
  name: string;
  url: string | null;
};

interface PersonalizationNewsSourcesProps {
  favoriteSources: string[];
  onFavoriteSourcesChange: (sources: string[]) => void;
}

const DEFAULT_AVAILABLE_SOURCES: NewsSourceOption[] = [
  {
    id: "newsapi-top-headlines",
    name: "NewsAPI Top Headlines",
    url: "https://newsapi.org",
  },
];

const INITIAL_VISIBLE_SOURCES = 6;

function toggleValue(current: string[], value: string): string[] {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}

export default function PersonalizationNewsSources({
  favoriteSources,
  onFavoriteSourcesChange,
}: PersonalizationNewsSourcesProps) {
  const [newsSourceOptions, setNewsSourceOptions] = useState<
    NewsSourceOption[]
  >(DEFAULT_AVAILABLE_SOURCES);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [sourceSearch, setSourceSearch] = useState("");
  const [showAllSources, setShowAllSources] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSources = async () => {
      try {
        const response = await fetch("/api/personalization/sources");
        if (!response.ok) return;

        const data = await response.json();
        const sources = Array.isArray(data?.sources)
          ? data.sources
              .map((source: Partial<NewsSourceOption>) => ({
                id: typeof source.id === "string" ? source.id : "",
                name: typeof source.name === "string" ? source.name.trim() : "",
                url: typeof source.url === "string" ? source.url : null,
              }))
              .filter((source: NewsSourceOption) => source.name)
          : [];

        if (mounted && sources.length > 0) {
          setNewsSourceOptions(sources);
        }
      } catch (sourceError) {
        console.warn("News sources could not be loaded.", sourceError);
      } finally {
        if (mounted) setIsLoadingSources(false);
      }
    };

    void loadSources();

    return () => {
      mounted = false;
    };
  }, []);

  const availableSources = useMemo(() => {
    const byName = new Map<string, NewsSourceOption>();

    for (const source of newsSourceOptions) {
      byName.set(source.name.toLowerCase(), source);
    }

    for (const source of favoriteSources) {
      const name = source.trim();
      if (!name || byName.has(name.toLowerCase())) continue;
      byName.set(name.toLowerCase(), {
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        url: null,
      });
    }

    return Array.from(byName.values());
  }, [favoriteSources, newsSourceOptions]);

  const filteredSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    if (!query) return availableSources;

    return availableSources.filter((source) =>
      source.name.toLowerCase().includes(query),
    );
  }, [availableSources, sourceSearch]);

  const visibleSources = useMemo(() => {
    if (sourceSearch.trim()) return filteredSources;
    if (showAllSources) return filteredSources;
    return filteredSources.slice(0, INITIAL_VISIBLE_SOURCES);
  }, [filteredSources, showAllSources, sourceSearch]);

  const shouldShowMoreSourcesButton =
    !sourceSearch.trim() &&
    !showAllSources &&
    filteredSources.length > INITIAL_VISIBLE_SOURCES;

  const handleSourceToggle = (source: string) => {
    const isSelected = favoriteSources.includes(source);

    if (!isSelected && favoriteSources.length >= PERSONALIZATION_MAX_SOURCES) {
      return;
    }

    onFavoriteSourcesChange(toggleValue(favoriteSources, source));
  };

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          News Sources
        </h2>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
          Select up to {PERSONALIZATION_MAX_SOURCES} news sources
        </p>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:px-2.5 sm:text-xs">
          {favoriteSources.length}/{PERSONALIZATION_MAX_SOURCES}
        </span>
      </div>

      <div className="relative mb-5">
        <input
          type="text"
          placeholder="Search news channels..."
          value={sourceSearch}
          onChange={(event) => setSourceSearch(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 pr-12 text-sm text-slate-900 transition focus:border-[var(--primary)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {sourceSearch.trim().length > 0 && (
          <button
            type="button"
            onClick={() => setSourceSearch("")}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label="Clear source search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleSources.map((source) => {
          const isSelected = favoriteSources.includes(source.name);
          const logoSrc = getSourceLogoSrc(source.url);

          return (
            <motion.label
              key={source.id || source.name}
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`group relative flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm transition-all duration-300 hover:shadow-md sm:gap-4 sm:p-5 ${
                isSelected
                  ? "border-[var(--primary)] bg-[var(--primary)]/[0.08] ring-1 ring-[var(--primary)]/20 dark:bg-[var(--primary)]/[0.12]"
                  : "border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleSourceToggle(source.name)}
                className="sr-only"
              />
              <div className="relative shrink-0">
                <SourceLogo
                  src={logoSrc}
                  alt={`${source.name} logo`}
                  fallbackLabel={source.name}
                  sizeClassName="h-9 w-9"
                />
                <div
                  className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border transition-all duration-300 ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary)] shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                      : "border-slate-300 bg-white opacity-0 dark:border-slate-600 dark:bg-slate-800 group-hover:opacity-100"
                  }`}
                >
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                        }}
                      >
                        <Check
                          size={11}
                          strokeWidth={3.5}
                          className="text-white"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-slate-800 transition-colors group-hover:text-slate-900 dark:text-slate-100 dark:group-hover:text-white">
                {source.name}
              </span>
            </motion.label>
          );
        })}
      </div>

      {sourceSearch.trim() && filteredSources.length === 0 ? (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          No news channels match your search.
        </p>
      ) : null}

      {shouldShowMoreSourcesButton && !showAllSources && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAllSources(true)}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[var(--primary)] hover:text-[var(--primary)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Show More Options
          </button>
        </div>
      )}

      {isLoadingSources ? (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading source channels
        </div>
      ) : null}
    </>
  );
}
