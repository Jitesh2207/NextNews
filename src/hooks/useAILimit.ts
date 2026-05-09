import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_DATA_EVENT,
  calculateFreeLimit,
  calculateWeightedUsage,
  FREE_PLAN_COOLDOWN_DAYS,
  readActivityAnalytics,
  MAX_FREE_CAP,
} from "@/lib/activityAnalytics";
import { loadUserSubscriptionPlan } from "@/app/services/subscriptionPlanService";

export function useAILimit() {
  const [hasPaidPlan, setHasPaidPlan] = useState(false);
  const [totalAIUsage, setTotalAIUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [planLimit, setPlanLimit] = useState(0);
  const [nextAvailableAt, setNextAvailableAt] = useState<string | null>(null);
  const [isFreePlanCooldown, setIsFreePlanCooldown] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const refreshUsageState = useCallback(async () => {
    const [activity, planResult] = await Promise.all([
      readActivityAnalytics().catch(() => null),
      loadUserSubscriptionPlan().catch(() => ({ data: null })),
    ]);

    const plan = planResult?.data;
    const isExemptFromFreeLimit = Boolean(plan?.status === "active" || plan?.status === "canceled");
    const isUnlimitedPlan =
      (Boolean(plan?.status === "active") && Boolean(plan?.plan_credit_is_unlimited)) ||
      (Boolean(plan?.status === "active") && plan?.plan_credit_amount === 0);

    // Use shared weighted credit system calculation
    const weightedCreditUsage = activity ? calculateWeightedUsage(activity) : 0;

    let isLocked = false;
    let nextAvail: string | null = null;
    let isCooldown = false;
    let effectiveLimit = 0;

    if (isExemptFromFreeLimit) {
      effectiveLimit = plan?.plan_credit_amount || 0;
      if (!isUnlimitedPlan) {
        isLocked = weightedCreditUsage >= effectiveLimit;
      }
    } else {
      // Stepped limit logic for free users
      let cycle = activity?.freeCooldownCycle || 0;
      let cooldownEnd = activity?.freeCooldownEnd || null;
      const now = Date.now();

      if (cooldownEnd) {
        if (now >= new Date(cooldownEnd).getTime()) {
          // Cooldown passed
          cycle += 1;
          cooldownEnd = null;
        } else {
          isCooldown = true;
          nextAvail = cooldownEnd;
        }
      }

      effectiveLimit = calculateFreeLimit(cycle);
      
      if (weightedCreditUsage >= MAX_FREE_CAP) {
        isLocked = true;
        isCooldown = false;
        nextAvail = null;
      } else {
        isLocked = weightedCreditUsage >= effectiveLimit;

        if (isLocked && !isCooldown) {
          // Just reached limit, predict next available
          const estimatedEnd = new Date(now + FREE_PLAN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
          nextAvail = estimatedEnd.toISOString();
          isCooldown = true;
        }
      }
    }

    return {
      total: weightedCreditUsage,
      isExempt: isExemptFromFreeLimit,
      isLocked,
      planCredits: effectiveLimit,
      isUnlimited: isUnlimitedPlan,
      nextAvailableAt: nextAvail,
      isFreePlanCooldown: isCooldown,
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const sync = async () => {
      try {
        const next = await refreshUsageState();
        if (!mounted) return;
        setTotalAIUsage(next.total);
        setHasPaidPlan(next.isExempt);
        setIsUnlimited(next.isUnlimited);
        setPlanLimit(next.planCredits);
        setNextAvailableAt(next.nextAvailableAt);
        setIsFreePlanCooldown(next.isFreePlanCooldown);
        setIsLocked(next.isLocked);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void sync();

    const onActivityUpdated = () => {
      void sync();
    };
    const onFocus = () => {
      void sync();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sync();
      }
    };

    window.addEventListener(ACTIVITY_DATA_EVENT, onActivityUpdated);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const intervalId = window.setInterval(() => {
      void sync();
    }, 10000);

    return () => {
      mounted = false;
      window.removeEventListener(ACTIVITY_DATA_EVENT, onActivityUpdated);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [refreshUsageState]);

  return {
    isLocked,
    totalAIUsage,
    limit: planLimit,
    loading,
    isActive: hasPaidPlan,
    isUnlimited,
    nextAvailableAt,
    isFreePlanCooldown,
  };
}
