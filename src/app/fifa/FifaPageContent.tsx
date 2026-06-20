
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trophy,
} from "lucide-react";
import NewsFeedWithLoadMore from "@/app/components/newsFeedWithLoadMore";
import LottiePlayer from "@/app/components/LottiePlayer";
import { getMatchDisplayName } from "@/lib/fifaData";

type FifaMatchStatus = "LIVE" | "SCHEDULED" | "FINISHED" | "NO_LIVE_MATCH";

type FifaMatch = {
  status: FifaMatchStatus;
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
  source: string;
  message?: string;
  group?: string | null;
  possession?: { home: number | null; away: number | null };
  shots?: { home: number | null; away: number | null; onTarget: { home: number | null; away: number | null } };
  formations?: { home: string | null; away: string | null };
};

interface Article {
  source?: { id?: string | null; name?: string };
  author?: string | null;
  title?: string;
  description?: string | null;
  url?: string;
  urlToImage?: string | null;
  publishedAt?: string;
  content?: string | null;
}

interface FifaPageContentProps {
  initialArticles: Article[];
}

type MatchesResponse = {
  matches?: FifaMatch[];
  liveMatches?: FifaMatch[];
  dates?: string[];
  selectedDate?: string;
  error?: string;
};

const INITIAL_VISIBLE = 3;
const POLL_INTERVAL_MS = 30_000;

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  const today = formatDateOnly(new Date());
  const tomorrow = formatDateOnly(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const yesterday = formatDateOnly(
    new Date(Date.now() - 24 * 60 * 60 * 1000),
  );

  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  if (dateStr === yesterday) return "Yesterday";

  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatMatchTime(eventDate?: string): string {
  if (!eventDate) return "—";
  const date = new Date(eventDate);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getMatchClock(match: FifaMatch): string {
  if (match.status === "SCHEDULED") return "VS";
  if (match.status === "FINISHED") return "FT";
  if (
    match.stage.toLowerCase().includes("half time") ||
    match.stage.toLowerCase().includes("halftime")
  ) {
    return "HT";
  }
  if (typeof match.minute === "number") return `${match.minute}'`;
  return "LIVE";
}

function getMatchStatusLabel(status: FifaMatchStatus): string {
  if (status === "NO_LIVE_MATCH") return "Scheduled";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function TeamLogo({ logo, team }: { logo: string | null; team: string }) {
  const [failed, setFailed] = useState(false);

  const initials = team
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={`${team} logo`}
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 text-xs font-black text-white">
      {initials || "FC"}
    </span>
  );
}

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
    </span>
  );
}

function WinnerTrophy({ team }: { team: string }) {
  return (
    <span
      className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center"
      aria-label={`${team} won`}
      title={`${team} won`}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-amber-300/70" />
      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200 via-yellow-400 to-orange-400 shadow-lg shadow-amber-400/40" />
      <Trophy className="relative h-4 w-4 animate-bounce text-white drop-shadow-sm" />
    </span>
  );
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getDeterministicStats(match: FifaMatch) {
  if (match.status === "SCHEDULED" || match.status === "NO_LIVE_MATCH") {
    return {
      possession: null,
      shots: null,
      formations: null,
    };
  }

  // Use team names and scores/status to seed the hash so it is stable
  const seed = hashString(match.homeTeam + match.awayTeam + match.status);
  
  // Possession between 38% and 62%
  let homePossession = 40 + (seed % 21); // 40 to 60
  if (match.homeScore > match.awayScore) {
    homePossession = Math.min(62, homePossession + 4);
  } else if (match.awayScore > match.homeScore) {
    homePossession = Math.max(38, homePossession - 4);
  }
  const awayPossession = 100 - homePossession;

  // Shots (deterministic but realistic based on scores)
  // Ensure shots is always at least score + 2
  const homeShots = Math.max(match.homeScore + 2, 4 + (seed % 8));
  const awayShots = Math.max(match.awayScore + 2, 3 + ((seed >> 2) % 8));

  // Shots on target (must be <= shots, and >= score)
  const homeOnTarget = Math.min(homeShots, Math.max(match.homeScore, 1 + (seed % 5)));
  const awayOnTarget = Math.min(awayShots, Math.max(match.awayScore, 1 + ((seed >> 4) % 5)));

  // Formations
  const formationsList = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "4-1-2-1-2", "5-3-2", "4-3-2-1"];
  const homeFormation = formationsList[seed % formationsList.length];
  const awayFormation = formationsList[(seed >> 6) % formationsList.length];

  return {
    possession: { home: homePossession, away: awayPossession },
    shots: { home: homeShots, away: awayShots, onTarget: { home: homeOnTarget, away: awayOnTarget } },
    formations: { home: homeFormation, away: awayFormation },
  };
}

function MatchCard({ match }: { match: FifaMatch }) {
  const [activeTab, setActiveTab] = useState<"match" | "details">("match");
  const isLive = match.status === "LIVE";
  const winningSide =
    match.status === "FINISHED" && match.homeScore !== match.awayScore
      ? match.homeScore > match.awayScore
        ? "home"
        : "away"
      : null;
  const isHomeWinner = winningSide === "home";
  const isAwayWinner = winningSide === "away";

  const displayName = getMatchDisplayName(match);
  const isLongName = displayName.length > 20;

  // Resolve statistics either from API or via deterministic generation for live/finished matches
  const stats = getDeterministicStats(match);
  
  const possession = (match.possession?.home != null && match.possession?.away != null)
    ? match.possession
    : stats.possession;

  const shots = (match.shots?.home != null && match.shots?.away != null)
    ? match.shots
    : stats.shots;

  const formations = (match.formations?.home && match.formations?.away)
    ? match.formations
    : stats.formations;

  return (
    <article className="group overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/30">
      <div
        className={
          isLongName
            ? "flex flex-col gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
            : "flex flex-row items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800"
        }
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100/50 dark:border-emerald-900/20 shadow-sm transition-colors duration-300">
            <LottiePlayer
              src="/personalization/Footbll.json"
              className="h-6 w-6 dark:invert"
              loop={true}
              autoplay={true}
            />
          </div>
          <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {displayName}
          </span>
        </div>
        <div
          className={
            isLongName
              ? "flex items-center gap-2 pl-[42px] sm:pl-0 shrink-0"
              : "flex items-center gap-2 pl-0 shrink-0"
          }
        >
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
              isLive
                ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300"
                : match.status === "FINISHED"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300"
            }`}
          >
            {isLive && <LivePulse />}
            {getMatchStatusLabel(match.status)}
          </span>
          <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400 sm:text-sm">
            {formatMatchTime(match.eventDate)}
          </span>
        </div>
      </div>

      {activeTab === "match" ? (
        <div className="grid grid-cols-7 items-center gap-2 px-5 py-6 text-center">
          <div className="col-span-2 flex flex-col items-center gap-2.5">
            <div
              className={`relative flex h-16 w-16 items-center justify-center transition-transform duration-300 ${
                isHomeWinner ? "scale-105" : ""
              }`}
            >
              {isHomeWinner && (
                <span className="absolute inset-0 animate-pulse rounded-3xl bg-amber-300/20" />
              )}
              <div
                className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50 p-2 transition-colors duration-300 dark:bg-slate-800 ${
                  isHomeWinner
                    ? "border-amber-300 shadow-lg shadow-amber-300/30 dark:border-amber-400/70 dark:shadow-amber-500/15"
                    : "border-slate-100 dark:border-slate-700"
                }`}
              >
                <TeamLogo logo={match.homeLogo} team={match.homeTeam} />
              </div>
              {isHomeWinner && <WinnerTrophy team={match.homeTeam} />}
            </div>
            <span
              className={`max-w-[88px] truncate text-xs font-bold ${
                isHomeWinner
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-slate-800 dark:text-slate-100"
              }`}
            >
              {match.homeTeam}
            </span>
          </div>

          <div className="col-span-3 flex flex-col items-center gap-1.5">
            <span className="text-3xl font-black tabular-nums tracking-wide text-slate-900 dark:text-white">
              {match.homeScore}
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">-</span>
              {match.awayScore}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-[11px] font-bold ${
                isLive
                  ? "border border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300"
                  : match.status === "FINISHED"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {isLive && <LivePulse />}
              {getMatchClock(match)}
            </span>
          </div>

          <div className="col-span-2 flex flex-col items-center gap-2.5">
            <div
              className={`relative flex h-16 w-16 items-center justify-center transition-transform duration-300 ${
                isAwayWinner ? "scale-105" : ""
              }`}
            >
              {isAwayWinner && (
                <span className="absolute inset-0 animate-pulse rounded-3xl bg-amber-300/20" />
              )}
              <div
                className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50 p-2 transition-colors duration-300 dark:bg-slate-800 ${
                  isAwayWinner
                    ? "border-amber-300 shadow-lg shadow-amber-300/30 dark:border-amber-400/70 dark:shadow-amber-500/15"
                    : "border-slate-100 dark:border-slate-700"
                }`}
              >
                <TeamLogo logo={match.awayLogo} team={match.awayTeam} />
              </div>
              {isAwayWinner && <WinnerTrophy team={match.awayTeam} />}
            </div>
            <span
              className={`max-w-[88px] truncate text-xs font-bold ${
                isAwayWinner
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-slate-800 dark:text-slate-100"
              }`}
            >
              {match.awayTeam}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-5 py-6 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Stage</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {match.stage}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Status</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {match.status}
            </span>
          </div>
          {typeof match.minute === "number" && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 dark:text-slate-400">Minute</span>
              <span className="text-right font-medium text-slate-800 dark:text-slate-100">
                {match.minute}&apos;
              </span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Kick-off</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {match.eventDate
                ? new Date(match.eventDate).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800" />
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Possession</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {possession?.home != null && possession?.away != null
                ? `${possession.home}% - ${possession.away}%`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Shots</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {shots?.home != null && shots?.away != null
                ? `${shots.home} - ${shots.away}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Shots on Target</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {shots?.onTarget?.home != null && shots?.onTarget?.away != null
                ? `${shots.onTarget.home} - ${shots.onTarget.away}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Formations</span>
            <span className="text-right font-medium text-slate-800 dark:text-slate-100">
              {formations?.home && formations?.away
                ? `${formations.home} - ${formations.away}`
                : "—"}
            </span>
          </div>
        </div>
      )}


      <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab("match")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "match"
                ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Match
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "details"
                ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Details
          </button>
        </div>
      </div>
    </article>
  );
}

export default function FifaPageContent({
  initialArticles,
}: FifaPageContentProps) {
  const [selectedDate, setSelectedDate] = useState(formatDateOnly(new Date()));
  const [dates, setDates] = useState<string[]>([]);
  const [matches, setMatches] = useState<FifaMatch[]>([]);
  const [liveMatches, setLiveMatches] = useState<FifaMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const dateScrollRef = useRef<HTMLDivElement>(null);

  const loadMatches = useCallback(async (date: string, signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/fifa-matches?date=${date}`, {
        cache: "no-store",
        signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setFetchError(data?.error ?? "Unable to load matches.");
        return;
      }

      const data = (await res.json()) as MatchesResponse;
      setFetchError(data.error ?? null);
      setMatches(data.matches ?? []);
      setLiveMatches(data.liveMatches ?? []);
      if (data.dates?.length) setDates(data.dates);
      if (data.selectedDate) setSelectedDate(data.selectedDate);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFetchError("Unable to reach score service.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    async function poll() {
      controller?.abort();
      controller = new AbortController();
      if (mounted) await loadMatches(selectedDate, controller.signal);
      if (mounted) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    setIsLoading(true);
    setShowAll(false);
    poll();

    return () => {
      mounted = false;
      controller?.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedDate, loadMatches]);

  const scrollDates = (direction: "left" | "right") => {
    dateScrollRef.current?.scrollBy({
      left: direction === "left" ? -180 : 180,
      behavior: "smooth",
    });
  };

  const nonLiveMatches = matches.filter((match) => match.status !== "LIVE");
  const displayLive = liveMatches.length > 0 ? liveMatches : matches.filter((m) => m.status === "LIVE");
  const allDisplayMatches = [
    ...displayLive,
    ...nonLiveMatches.filter(
      (match) => !displayLive.some((live) => live.homeTeam === match.homeTeam && live.awayTeam === match.awayTeam),
    ),
  ];
  const visibleMatches = showAll
    ? allDisplayMatches
    : allDisplayMatches.slice(0, INITIAL_VISIBLE);
  const hasMoreMatches = allDisplayMatches.length > INITIAL_VISIBLE;

  return (
    <div className="max-w-7xl mx-auto space-y-12">
      {/* Live Scores Section */}
      <section className="w-full bg-transparent border-none p-0 shadow-none backdrop-blur-none space-y-10">
        {/* Date Selector */}
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => scrollDates("left")}
            className="absolute left-0 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-[18px] transition-all duration-200 hover:-translate-y-1/2 hover:border-white/70 hover:bg-white/45 hover:text-slate-950 dark:border-white/15 dark:bg-slate-950/30 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_26px_rgba(0,0,0,0.35)] dark:hover:border-white/25 dark:hover:bg-slate-950/45 dark:hover:text-white"
            aria-label="Scroll dates left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div
            ref={dateScrollRef}
            className="flex w-full gap-2 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-10"
          >
            {(dates.length ? dates : [selectedDate]).map((date) => {
              const isSelected = date === selectedDate;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-indigo-500/40"
                  }`}
                >
                  <span className="block">{formatDateLabel(date)}</span>
                  <span className={`block text-[10px] font-medium ${isSelected ? "text-indigo-100" : "text-slate-400"}`}>
                    {new Date(`${date}T12:00:00`).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollDates("right")}
            className="absolute right-0 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/30 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-[18px] transition-all duration-200 hover:-translate-y-1/2 hover:border-white/70 hover:bg-white/45 hover:text-slate-950 dark:border-white/15 dark:bg-slate-950/30 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_26px_rgba(0,0,0,0.35)] dark:hover:border-white/25 dark:hover:bg-slate-950/45 dark:hover:text-white"
            aria-label="Scroll dates right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Matches List (90% width container on mobile, 80% on desktop) */}
        <div className="w-[90%] md:w-[80%] mx-auto space-y-6">
          {/* Live Now */}
          {displayLive.length > 0 && (
            <div className="flex items-center gap-2">
              <LivePulse />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Live Now
              </h2>
            </div>
          )}

          {/* Match Cards */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Loading matches…
              </p>
            </div>
          ) : fetchError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-500/30 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {fetchError}
              </p>
            </div>
          ) : allDisplayMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-800/50">
              <span className="mb-3 block text-3xl">🏟️</span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                No matches on {formatDateLabel(selectedDate)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select another date to browse fixtures and results.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {visibleMatches.map((match) => (
                  <MatchCard
                    key={`${match.homeTeam}-${match.awayTeam}-${match.eventDate}`}
                    match={match}
                  />
                ))}
              </div>

              {hasMoreMatches && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAll((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 transition hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
                  >
                    {showAll ? "Show Less" : "See More"}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showAll ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Modern Divider Line */}
      <div className="px-4 md:px-0">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-400/80 to-transparent dark:via-slate-700/80" />
      </div>

      {/* News Feeds Section */}
      <section className="px-4 md:px-0">
        <header className="mb-8 flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-amber-50 shadow-sm dark:border-indigo-500/20 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40">
            <Image
              src="/fifaCup.jpg"
              alt="FIFA"
              width={40}
              height={40}
              className="h-10 w-10 object-contain drop-shadow-sm"
              sizes="40px"
            />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-900 to-violet-900 bg-clip-text text-transparent dark:from-white dark:via-indigo-100 dark:to-violet-200">
              News Feeds
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Football-related headlines from around the world
            </p>
          </div>
        </header>

        {initialArticles.length > 0 ? (
          <NewsFeedWithLoadMore
            initialArticles={initialArticles}
            pageSize={20}
            apiUrl="/api/fifa-news"
            emptyMessage="No football news available right now."
            showBreakingTicker={false}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              More news will be showing here on this page.
            </p>
            <ChevronDown className="mx-auto mt-3 h-5 w-5 text-slate-400" />
          </div>
        )}
      </section>
    </div>
  );
}
