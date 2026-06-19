"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Calendar, ChevronRight, Tv2, Trophy } from "lucide-react";
import UnderConstructionPopup from "./UnderConstructionPopup";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  source: string;
  message?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMatchClock(match: FifaMatch): string {
  if (match.status === "FINISHED") return "FT";
  if (match.status === "NO_LIVE_MATCH") return "—";
  if (
    match.stage.toLowerCase().includes("half time") ||
    match.stage.toLowerCase().includes("halftime")
  )
    return "HT";
  if (typeof match.minute === "number") return `${match.minute}'`;
  return "LIVE";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function TeamLogo({ logo, team }: { logo: string | null; team: string }) {
  const [failed, setFailed] = useState(false);

  const initials = team
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={`${team} logo`}
        className="h-full w-full object-contain rounded-md"
        onError={() => setFailed(true)}
      />
    );
  }

  if (team === "—") {
    return (
      <span className="flex h-full w-full items-center justify-center rounded-md bg-white/10 text-base text-white/40">
        ?
      </span>
    );
  }

  return (
    <span className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 via-sky-500 to-amber-400 text-[11px] font-black text-white shadow-sm">
      {initials || "FC"}
    </span>
  );
}

function LivePulse() {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FifaSection() {
  const [match, setMatch] = useState<FifaMatch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [goalEvent, setGoalEvent] = useState<{
    active: boolean;
    team: string | null;
  }>({ active: false, team: null });
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const prevScoreRef = useRef<{
    homeScore: number;
    awayScore: number;
    homeTeam: string;
    awayTeam: string;
  } | null>(null);

  const triggerGoal = useCallback((team: string) => {
    setGoalEvent({ active: true, team });
    window.setTimeout(() => setGoalEvent({ active: false, team: null }), 3000);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch(`/api/fifa-live?t=${Date.now()}`, { cache: "no-store" });
        if (!mounted) return;

        if (!res.ok) {
          setFetchError(true);
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { match?: FifaMatch }
          | null;
        if (!mounted || !data?.match) return;

        const next = data.match;
        setFetchError(false);

        // Detect goal
        const prev = prevScoreRef.current;
        if (prev) {
          if (next.homeScore > prev.homeScore) triggerGoal(next.homeTeam);
          else if (next.awayScore > prev.awayScore) triggerGoal(next.awayTeam);
        }
        prevScoreRef.current = {
          homeScore: next.homeScore,
          awayScore: next.awayScore,
          homeTeam: next.homeTeam,
          awayTeam: next.awayTeam,
        };

        setMatch(next);
      } catch {
        if (mounted) setFetchError(true);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [triggerGoal]);

  const handleButtonClick = () => setIsPopupOpen(true);

  const isLive = match?.status === "LIVE";
  const isNoMatch =
    !match || match.status === "NO_LIVE_MATCH" || match.source === "no-live";

  const badgeLabel = isLive ? "LIVE" : "UPDATES";
  const stageLabel = isLoading
    ? "Fetching match…"
    : isNoMatch
      ? "No live match right now"
      : (match?.stage ?? "Live");

  return (
    <>
      <div
        className="
          relative w-full rounded-3xl overflow-hidden mb-10
          bg-cover bg-center bg-no-repeat min-h-[300px] flex items-center
          border border-white/15
          shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.2)]
          transition-all duration-300 hover:border-white/25
          hover:shadow-[0_30px_70px_-10px_rgba(99,102,241,0.25),0_25px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_2px_rgba(255,255,255,0.35)]
        "
        style={{ backgroundImage: "url('/fifaBG.png')" }}
      >
        <div className="absolute inset-0 bg-slate-950/20 mix-blend-multiply" />

        <div className="relative z-10 w-full px-4 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 xl:py-12 grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8 items-center">
          {/* ── Left: Headline ─────────────────────────────────────────────── */}
          <div className="xl:col-span-7 2xl:col-span-8 flex flex-col items-stretch gap-5 xl:gap-0">
            {/* Mobile: cup + competition */}
            <div className="flex items-center gap-3 xl:hidden">
              <div
                className="shrink-0 cursor-pointer flex items-center"
                onClick={handleButtonClick}
              >
                <Image
                  src="/fifaCup.jpg"
                  alt="FIFA Cup"
                  width={48}
                  height={48}
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-white/25 to-transparent self-center mx-1" />
              <span className="text-[11px] sm:text-xs font-semibold tracking-wider text-slate-300/95 uppercase">
                {match?.competition ?? "FIFA World Cup 2026"}
              </span>
            </div>

            <div className="flex flex-col xl:flex-row items-start xl:items-center gap-6 xl:gap-0">
              {/* Desktop: cup image */}
              <div
                className="hidden xl:flex shrink-0 items-center justify-center pr-6 group cursor-pointer"
                onClick={handleButtonClick}
              >
                <Image
                  src="/fifaCup.jpg"
                  alt="FIFA Cup"
                  width={88}
                  height={88}
                  className="w-16 sm:w-20 md:w-[88px] h-auto object-contain transition-transform duration-500 hover:scale-105"
                />
              </div>
              <div className="hidden xl:block w-px h-28 bg-gradient-to-b from-transparent via-white/25 to-transparent self-center mr-6" />

              <div className="flex-1 space-y-2.5 sm:space-y-3">
                <span className="hidden xl:inline-block text-sm font-semibold tracking-wider text-slate-300/95 uppercase">
                  {match?.competition ?? "FIFA World Cup 2026"}
                </span>
                <h2 className="text-[25px] sm:text-3xl xl:text-[40px] font-extrabold tracking-tight text-white drop-shadow-sm leading-tight">
                  It&apos;s Happening Now! ⚽
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-slate-200 font-medium max-w-lg leading-relaxed">
                  Don&apos;t be late — catch up on matches with{" "}
                  <span className="text-amber-400 font-bold">real-time</span>{" "}
                  updated scores.
                </p>

                <div className="grid grid-cols-2 gap-2.5 xl:flex xl:flex-wrap xl:items-center xl:gap-4 pt-2 xl:pt-3.5 w-full">
                  <button
                    onClick={handleButtonClick}
                    className="
                      flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 xl:px-6 xl:py-3
                      rounded-xl text-[11px] sm:text-xs xl:text-sm font-bold text-white
                      bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg shadow-indigo-600/20
                      transition-all duration-300 hover:from-blue-400 hover:to-purple-500
                      hover:scale-[1.02] active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full xl:w-auto
                    "
                  >
                    <span>Live Scores</span>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  </button>

                  <button
                    onClick={handleButtonClick}
                    className="
                      flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 xl:px-6 xl:py-3
                      rounded-xl text-[11px] sm:text-xs xl:text-sm font-bold text-white
                      border border-white/30 bg-transparent
                      transition-all duration-300 hover:bg-white/10 hover:border-white/60
                      hover:scale-[1.02] active:scale-[0.98]
                      focus:outline-none focus:ring-2 focus:ring-white/30 w-full xl:w-auto
                    "
                  >
                    <Calendar size={14} className="xl:w-4 xl:h-4 shrink-0" strokeWidth={2.2} />
                    <span>View Fixtures</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Score card ─────────────────────────────────────────── */}
          <div className="xl:col-span-5 2xl:col-span-4 flex justify-center xl:justify-end">
            <div
              className="
                relative overflow-hidden w-full max-w-[340px] rounded-2xl p-5
                bg-slate-950/50 backdrop-blur-xl border border-white/15
                shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.15)]
                transition-all duration-300 hover:border-white/30 hover:bg-slate-950/60
                hover:shadow-[0_25px_55px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)]
              "
            >
              {/* GOAL overlay */}
              {goalEvent.active && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center bg-gradient-to-br from-amber-500/95 via-yellow-500/95 to-amber-600/95">
                  <Trophy className="h-10 w-10 text-white animate-bounce" />
                  <span className="text-white text-3xl font-black tracking-widest uppercase mt-1">
                    GOAL!!!
                  </span>
                  <span className="text-white text-sm font-bold tracking-wide mt-1">
                    {goalEvent.team} has scored!
                  </span>
                </div>
              )}

              {/* Card header: badge + stage */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20">
                  <LivePulse />
                  {badgeLabel}
                </span>
                <span className="inline-flex rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-slate-200 border border-white/5 truncate max-w-[160px]">
                  {stageLabel}
                </span>
              </div>

              {/* Score area */}
              {isLoading ? (
                /* Loading skeleton */
                <div className="flex items-center justify-center py-6 gap-4">
                  <div className="h-12 w-12 rounded-full bg-white/10 animate-pulse" />
                  <div className="h-8 w-16 rounded-lg bg-white/10 animate-pulse" />
                  <div className="h-12 w-12 rounded-full bg-white/10 animate-pulse" />
                </div>
              ) : fetchError ? (
                /* Fetch error state */
                <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                  <Tv2 className="h-8 w-8 text-slate-500" />
                  <p className="text-[11px] text-slate-400 font-medium">
                    Unable to reach score service.
                  </p>
                  <p className="text-[10px] text-slate-500">Retrying in 30s…</p>
                </div>
              ) : isNoMatch ? (
                /* No live match state */
                <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
                  <span className="text-2xl">🏟️</span>
                  <p className="text-[11px] text-slate-300 font-semibold">
                    No match live right now
                  </p>
                  <p className="text-[10px] text-slate-500 leading-snug max-w-[220px]">
                    Check back during match times. Scores update automatically.
                  </p>
                </div>
              ) : (
                /* Live match scoreboard */
                <div className="grid grid-cols-7 items-center justify-items-center text-center">
                  <div
                    className="col-span-2 flex flex-col items-center gap-2 group cursor-pointer"
                    onClick={handleButtonClick}
                  >
                    <div className="h-12 w-12 rounded-full overflow-hidden border border-white/15 flex items-center justify-center bg-slate-900/50 p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-all duration-300 group-hover:scale-110 group-hover:border-white/35">
                      <TeamLogo logo={match!.homeLogo} team={match!.homeTeam} />
                    </div>
                    <span className="text-xs font-bold text-slate-100 tracking-wide truncate max-w-[72px]">
                      {match!.homeTeam}
                    </span>
                  </div>

                  <div className="col-span-3 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black tracking-wider text-white drop-shadow-sm tabular-nums flex items-center gap-1.5">
                      <span>{match!.homeScore}</span>
                      <span className="text-white/40 text-2xl font-light">-</span>
                      <span>{match!.awayScore}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold font-mono tracking-wide text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-400/25 shadow-[0_0_12px_rgba(245,158,11,0.1)]">
                      {getMatchClock(match!)}
                    </span>
                  </div>

                  <div
                    className="col-span-2 flex flex-col items-center gap-2 group cursor-pointer"
                    onClick={handleButtonClick}
                  >
                    <div className="h-12 w-12 rounded-full overflow-hidden border border-white/15 flex items-center justify-center bg-slate-900/50 p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-all duration-300 group-hover:scale-110 group-hover:border-white/35">
                      <TeamLogo logo={match!.awayLogo} team={match!.awayTeam} />
                    </div>
                    <span className="text-xs font-bold text-slate-100 tracking-wide truncate max-w-[72px]">
                      {match!.awayTeam}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleButtonClick}
                className="w-full mt-4 pt-3.5 border-t border-white/10 flex items-center justify-center gap-1 text-xs font-bold text-indigo-300 hover:text-indigo-200 transition-colors group"
              >
                See All Live Matches
                <ChevronRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <UnderConstructionPopup
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
      />
    </>
  );
}
