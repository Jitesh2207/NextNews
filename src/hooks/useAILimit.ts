import { useState, useEffect } from "react";
import { useUserPlan } from "@/app/plans/payments/useUserPlan";
import { readActivityAnalytics } from "@/lib/activityAnalytics";

const AI_FREE_LIMIT = 10;

export function useAILimit() {
  const { isActive, loading: planLoading } = useUserPlan();
  const [totalAIUsage, setTotalAIUsage] = useState(0);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    let mounted = true;
    readActivityAnalytics()
      .then((data) => {
        if (mounted) {
          const total =
            (data.aiSummaryCount || 0) +
            (data.personalizationSuggestionCount || 0) +
            (data.regionSuggestionCount || 0);
          setTotalAIUsage(total);
          setLoadingUsage(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadingUsage(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Free limit: 10 uses across all AI features.
  // Locked if they have reached the limit AND do NOT have an active plan.
  const isLocked = !isActive && totalAIUsage >= AI_FREE_LIMIT;
  const loading = planLoading || loadingUsage;

  return {
    isLocked,
    totalAIUsage,
    limit: AI_FREE_LIMIT,
    loading,
    isActive, // Exposed in case the UI needs to know if they have an active plan
  };
}
