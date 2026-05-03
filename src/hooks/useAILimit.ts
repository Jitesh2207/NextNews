import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_DATA_EVENT,
  readActivityAnalytics,
} from "@/lib/activityAnalytics";
import { loadUserSubscriptionPlan } from "@/app/services/subscriptionPlanService";
import { AI_FREE_LIMIT } from "@/lib/aiUsageLimit";

export function useAILimit() {
  const [hasPaidPlan, setHasPaidPlan] = useState(false);
  const [totalAIUsage, setTotalAIUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [planLimit, setPlanLimit] = useState(0);

  const refreshUsageState = useCallback(async () => {
    const [activity, planResult] = await Promise.all([
      readActivityAnalytics().catch(() => null),
      loadUserSubscriptionPlan().catch(() => ({ data: null })),
    ]);

    const plan = planResult?.data;
    const isExemptFromFreeLimit = Boolean(plan?.status === "active");
    const isUnlimitedPlan =
      (Boolean(plan?.status === "active") && Boolean(plan?.plan_credit_is_unlimited)) ||
      (Boolean(plan?.status === "active") && plan?.plan_credit_amount === 0);

    // 1. Standard Count for Non-Plan users (Total AI uses)
    const totalAIUsageCount =
      (activity?.aiSummaryCount || 0) +
      (activity?.personalizationSuggestionCount || 0) +
      (activity?.regionSuggestionCount || 0);

    // 2. Weighted Credit usage for Plan users
    const aiWeightedUsage =
      (activity?.aiSummaryCount || 0) * 1 +
      (activity?.personalizationSuggestionCount || 0) * 2 +
      (activity?.regionSuggestionCount || 0) * 2;
    
    const otherUsage = (activity?.articleReadCount || 0);
    const otherEventsCount = (activity?.events || [])
      .filter(e => !["ai_summary", "personalization_suggestion", "region_suggestion", "article_open"].includes(e.type))
      .length;

    const weightedCreditUsage = aiWeightedUsage + otherUsage + otherEventsCount;

    let isLocked = false;
    if (isExemptFromFreeLimit) {
      if (!isUnlimitedPlan) {
        const planCredits = plan?.plan_credit_amount || 0;
        isLocked = weightedCreditUsage >= planCredits;
      }
    } else {
      isLocked = totalAIUsageCount >= AI_FREE_LIMIT;
    }

    return { 
      total: isExemptFromFreeLimit ? weightedCreditUsage : totalAIUsageCount, 
      isExempt: isExemptFromFreeLimit,
      isLocked,
      planCredits: plan?.plan_credit_amount || 0,
      isUnlimited: isUnlimitedPlan
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

  // Unified locking logic:
  // If user has plan: lock if weighted usage >= plan credits
  // If user has no plan: lock if unweighted count >= AI_FREE_LIMIT
  const isLocked = hasPaidPlan 
    ? (!isUnlimited && planLimit > 0 && totalAIUsage >= planLimit)
    : (totalAIUsage >= AI_FREE_LIMIT);

  return {
    isLocked,
    totalAIUsage,
    limit: hasPaidPlan ? planLimit : AI_FREE_LIMIT,
    loading,
    isActive: hasPaidPlan,
    isUnlimited,
  };
}
