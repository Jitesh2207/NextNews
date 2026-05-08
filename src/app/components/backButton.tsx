"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface BackButtonProps {
  label?: string;
  className?: string;
}

export default function BackButton({
  label = "Back",
  className,
}: BackButtonProps) {
  const router = useRouter();
  const resolvedClassName =
    className ??
    "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700";

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={resolvedClassName}
      aria-label="Go back"
    >
      <ArrowLeft size={16} />
      {label}
    </button>
  );
}
