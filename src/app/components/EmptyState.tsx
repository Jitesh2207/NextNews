"use client";

import React, { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Compass, Lightbulb } from "lucide-react";
import Link from "next/link";
import LottiePlayer from "./LottiePlayer";

export default function EmptyState() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    });
  };

  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 md:py-16 max-w-lg mx-auto w-full select-none">
      {/* Dynamic Lottie Paperplane Animation */}
      <div className="relative w-48 h-48 md:w-56 md:h-56 mx-auto mb-6 flex items-center justify-center">
        {/* Soft background glow behind Lottie */}
        <div className="absolute inset-0 rounded-full bg-blue-500/5 blur-3xl" />
        <LottiePlayer
          src="/auth/Loading%2040%20_%20Paperplane.json"
          className="w-full h-full object-contain relative z-10"
        />
      </div>

      {/* Title */}
      <h2 className="text-[#0F172A] dark:text-slate-100 font-extrabold text-2xl sm:text-3xl tracking-tight mb-3 leading-tight">
        Fresh updates coming your way!
      </h2>

      {/* Subtitle */}
      <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-[380px] sm:max-w-md mx-auto mb-8 leading-relaxed">
        We're fetching the latest and most important stories for you. Please check back in a moment.
      </p>

      {/* Actions */}
      <div className="flex flex-row items-center justify-center gap-2.5 w-full max-w-[420px]">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="
            flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-blue-400/80
            text-white font-semibold px-4 sm:px-6 py-3 rounded-xl transition-all duration-200 
            shadow-[0_4px_12px_rgba(37,99,235,0.15)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.3)]
            active:scale-[0.97] cursor-pointer select-none text-xs sm:text-sm whitespace-nowrap flex-1 justify-center
          "
        >
          <RefreshCw className={`h-4 w-4 sm:h-4.5 sm:w-4.5 ${isRefreshing ? "animate-spin" : ""}`} strokeWidth={2.5} />
          <span>Refresh</span>
        </button>

        <Link
          href="/explore"
          className="
            flex items-center justify-center gap-1.5 bg-white/80 hover:bg-slate-50 border border-slate-300
            dark:bg-slate-900/80 dark:hover:bg-slate-800 dark:border-slate-700
            text-slate-700 dark:text-slate-200 font-semibold px-4 sm:px-6 py-3 rounded-xl transition-all duration-200
            shadow-sm hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] active:scale-[0.97]
            cursor-pointer select-none text-xs sm:text-sm backdrop-blur-sm whitespace-nowrap flex-[1.2] justify-center
          "
        >
          <Compass className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-slate-500 dark:text-slate-400" strokeWidth={2.2} />
          <span>Explore Categories</span>
        </Link>
      </div>

      {/* Modern, Subtle Divider */}
      <div className="w-full border-t border-slate-200 dark:border-slate-700 my-8" />

      {/* Tip Section */}
      <div className="flex items-center gap-3 justify-center max-w-sm w-full">
        <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400">
          <Lightbulb className="h-4.5 w-4.5 fill-amber-500/10" strokeWidth={2} />
        </div>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium text-left leading-snug">
          Tip: Explore other categories while we fetch the latest news.😉
        </p>
      </div>
    </div>
  );
}
