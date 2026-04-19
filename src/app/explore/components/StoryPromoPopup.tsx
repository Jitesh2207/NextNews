"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Layers, X } from "lucide-react";
import type { CSSProperties, RefObject } from "react";

type StoryPromoPopupProps = {
  isOpen: boolean;
  popupRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  placement: "above" | "below";
  arrowLeft: number;
  onDismiss: () => void;
};

export default function StoryPromoPopup({
  isOpen,
  popupRef,
  style,
  placement,
  arrowLeft,
  onDismiss,
}: StoryPromoPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popupRef}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={style}
          className="fixed z-20 w-64 max-w-[85vw] rounded-2xl border border-sky-200/90 bg-sky-50/95 p-3 pr-8 text-left shadow-xl shadow-sky-500/10 backdrop-blur-sm sm:max-w-[70vw] dark:border-sky-900/70 dark:bg-sky-950/90"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-500/30">
              <Layers size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-sky-950 dark:text-sky-100">
                Dive Deeper
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-sky-800/90 dark:text-sky-200/90">
                Select a story to view related news and a detailed breakdown.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-sky-700 transition hover:bg-sky-100 hover:text-sky-900 dark:text-sky-300 dark:hover:bg-sky-900/60 dark:hover:text-sky-100"
            aria-label="Dismiss tip"
          >
            <X size={14} />
          </button>
          <span
            className={`absolute h-3.5 w-3.5 bg-sky-50 dark:bg-sky-950 ${
              placement === "above"
                ? "-bottom-2 border-b border-r border-sky-200/90 dark:border-sky-900/70"
                : "-top-2 border-l border-t border-sky-200/90 dark:border-sky-900/70"
            }`}
            style={{
              left: arrowLeft,
              transform: "translateX(-50%) rotate(45deg)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
