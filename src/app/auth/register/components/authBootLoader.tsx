"use client";

import { useEffect, useState } from "react";
import LottiePlayer from "@/app/components/LottiePlayer";

/**
 * AuthBootLoader
 *
 * Renders the full-screen authentication loading overlay ONLY while an
 * active auth flow is in progress. It watches the `auth-boot-loading`
 * class on <html> (toggled by the inline boot-script in layout.tsx and
 * by AuthSessionSync) and mounts its content — including the Lottie
 * animation — only when that class is present.
 *
 * When no auth flow is running the component returns null, so it adds
 * zero overhead to regular page loads.
 */
export default function AuthBootLoader() {
  const [isAuthBooting, setIsAuthBooting] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const checkClass = () =>
      setIsAuthBooting(root.classList.contains("auth-boot-loading"));

    // Sync with whatever the inline boot-script already set before React
    // hydrated.
    checkClass();

    // Watch for future class changes driven by AuthSessionSync.
    const observer = new MutationObserver(checkClass);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  if (!isAuthBooting) return null;

  return (
    <div
      id="auth-boot-loader"
      role="status"
      aria-live="polite"
      aria-label="Authentication in progress"
    >
      <section className="auth-boot-card">
        <div className="auth-boot-plane" aria-hidden="true">
          <LottiePlayer
            src="/auth/Loading%2040%20_%20Paperplane.json"
            className="h-14 w-14"
          />
        </div>
        <p className="auth-boot-kicker">NextNews onboarding</p>
        <h1>Signing you in</h1>
        <p>
          Please stay with us while we finish authentication and prepare your
          workspace.
        </p>
        <div className="auth-boot-progress">
          <span />
          <span />
        </div>
      </section>
    </div>
  );
}
