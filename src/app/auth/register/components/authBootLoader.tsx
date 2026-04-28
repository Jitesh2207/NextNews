"use client";

import LottiePlayer from "@/app/components/LottiePlayer";

/**
 * AuthBootLoader
 *
 * Renders the full-screen authentication loading overlay shell on every page,
 * while the `auth-boot-loading` class on <html> controls whether it is visible.
 *
 * Keeping the markup present from the first paint lets the inline boot script
 * in layout.tsx show the loader immediately on OAuth callback URLs, before
 * React hydration finishes.
 */
export default function AuthBootLoader() {
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
          Nextspace.
        </p>
        <div className="auth-boot-progress">
          <span aria-hidden="true">&nbsp;</span>
          <span aria-hidden="true">&nbsp;</span>
        </div>
      </section>
    </div>
  );
}
