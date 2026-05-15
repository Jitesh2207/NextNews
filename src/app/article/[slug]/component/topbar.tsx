"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import AddNoteButton from "@/app/components/addNoteButton";

interface TopbarProps {
  className?: string;
  isOverlay?: boolean;
  article?: {
    title: string;
    url: string;
    publishedTime?: string;
    siteName?: string;
  };
}

export default function Topbar({
  className,
  isOverlay = true,
  article,
}: TopbarProps) {
  const router = useRouter();

  const baseButtonStyle = isOverlay
    ? "bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-lg hover:bg-white/30"
    : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-sm hover:border-blue-200 dark:hover:border-blue-700";

  return (
    <div className={`flex items-center justify-between ${isOverlay ? "w-[94%]" : "w-full"} mx-auto`}>
      <button
        type="button"
        onClick={() => router.back()}
        className={className ?? `inline-flex items-center justify-center p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 ${isOverlay ? "focus:ring-white/50" : "focus:ring-blue-500"} ${baseButtonStyle}`}
        aria-label="Go back"
      >
        <ArrowLeft size={isOverlay ? 20 : 18} strokeWidth={isOverlay ? 2.5 : 2} />
      </button>

      {article && (
        <div className="md:hidden">
          <AddNoteButton
            title={article.title}
            link={article.url}
            publishedAt={article.publishedTime}
            sourceName={article.siteName}
            buttonLabel=""
            buttonIcon="pencil"
            buttonClassName={`inline-flex items-center justify-center p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 ${isOverlay ? "focus:ring-white/50" : "focus:ring-blue-500"} ${baseButtonStyle}`}
          />
        </div>
      )}
    </div>
  );
}
