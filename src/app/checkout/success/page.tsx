"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { loadUserSubscriptionPlan } from "@/app/services/subscriptionPlanService";

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const plan = searchParams.get("plan");
  const [countdown, setCountdown] = useState(5);
  const [isActive, setIsActive] = useState(false);

  // Poll for webhook-confirmed activation; if it fails/cancels, redirect to failure
  useEffect(() => {
    let cancelled = false;

    async function pollUntilActive() {
      const negativeStatuses = new Set(["failed", "canceled", "cancelled", "expired", "on_hold"]);
      for (let i = 0; i < 40 && !cancelled; i++) {
        const { data } = await loadUserSubscriptionPlan().catch(() => ({ data: null }));
        const status = data?.status || null;

        if (status === "active") {
          if (!cancelled) setIsActive(true);
          return;
        }
        if (status && negativeStatuses.has(status)) {
          if (!cancelled) {
            router.replace(plan ? `/checkout/failure?plan=${plan}` : "/checkout/failure");
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!cancelled) {
        router.replace(plan ? `/plans?plan=${plan}` : "/plans");
      }
    }

    void pollUntilActive();
    return () => {
      cancelled = true;
    };
  }, [plan, router]);

  // Start redirect countdown only after activation
  useEffect(() => {
    if (!isActive) return;
    if (countdown <= 0) {
      router.push(plan ? `/plans?plan=${plan}` : "/plans");
      return;
    }
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [isActive, countdown, router, plan]);

  const planLabel =
    plan === "pro_monthly"
      ? "Pro (Monthly)"
      : plan === "pro_yearly"
        ? "Pro (Yearly)"
        : plan === "proplus_monthly"
          ? "Pro+ (Monthly)"
          : plan === "proplus_yearly"
            ? "Pro+ (Yearly)"
            : "Premium";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-white dark:from-slate-950 dark:to-slate-900 px-4">
      <div className="max-w-md w-full text-center bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-10">
        <div className="flex justify-center mb-6">
          {isActive ? (
            <CheckCircle2 className="h-16 w-16 text-teal-500" />
          ) : (
            <Loader2 className="h-16 w-16 text-teal-500 animate-spin" />
          )}
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {isActive ? "Payment Successful!" : "Processing your payment..."}
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-4">
          {isActive ? (
            <>
              You're now on the{" "}
              <span className="font-semibold text-teal-600">{planLabel}</span> plan.
              Welcome to NextNews premium!
            </>
          ) : (
            "We’re confirming your payment with our billing provider. This can take a few moments. You’ll be redirected automatically once confirmed."
          )}
        </p>
        {isActive ? (
          <>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">
              Redirecting to your plans page in {countdown}s...
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full rounded-xl bg-teal-600 text-white py-3 font-semibold hover:bg-teal-700 transition-colors"
            >
              Start Reading Now
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push(plan ? `/plans?plan=${plan}` : "/plans")}
              className="w-full rounded-xl bg-teal-600 text-white py-3 font-semibold hover:bg-teal-700 transition-colors"
            >
              Go to Plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-slate-500">Loading...</p>
        </div>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}
