import { createClient } from "@supabase/supabase-js";
import {
  ActivityAnalytics,
  calculateFreeLimit,
  FREE_PLAN_COOLDOWN_DAYS,
  calculateWeightedUsage,
  MAX_FREE_CAP,
} from "./activityAnalytics";

export const AI_FREE_LIMIT = 20;

type UsageDecision = {
  totalAIUsage: number;
  limit: number;
  isLocked: boolean;
  hasPaidPlan: boolean;
  nextAvailableAt?: string | null;
  isFreePlanCooldown?: boolean;
};

type PlanRow = {
  plan_key?: string | null;
  status?: string | null;
  plan_credit_amount?: number | null;
  plan_credit_is_unlimited?: boolean | null;
  free_plan_next_available_at?: string | null;
};

function toCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function getValidatedSupabaseUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!rawUrl) return null;

  try {
    return new URL(rawUrl).toString();
  } catch {
    return null;
  }
}

function createUserScopedSupabase(token: string) {
  const url = getValidatedSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export async function evaluateAiUsageAccess(
  token: string,
): Promise<UsageDecision> {
  const client = createUserScopedSupabase(token);
  if (!client) {
    return { totalAIUsage: 0, limit: 20, isLocked: false, hasPaidPlan: false };
  }

  const [{ data: planData }, { data: activityData }] = await Promise.all([
    client
      .from("user_subscription_plans")
      .select("plan_key,status,plan_credit_amount,plan_credit_is_unlimited")
      .maybeSingle<PlanRow>(),
    client.from("user_activities").select("activity_data").maybeSingle(),
  ]);

  const plan = planData ?? null;
  const isExemptFromFreeLimit = Boolean(plan?.status === "active" || plan?.status === "canceled");
  const isUnlimited = Boolean(plan?.status === "active" && plan?.plan_credit_is_unlimited);
  const activity = (activityData?.activity_data ?? {}) as ActivityAnalytics;

  // Use shared weighted credit system calculation
  const weightedCreditUsage = calculateWeightedUsage(activity);

  let isLocked = false;
  let nextAvailableAt: string | null = null;
  let isFreePlanCooldown = false;
  let limit = 0;

  if (isExemptFromFreeLimit) {
    // If they have a plan, locked only if credits exhausted
    if (!isUnlimited) {
      limit = toCount(plan?.plan_credit_amount);
      isLocked = weightedCreditUsage >= limit;
    } else {
      limit = Infinity;
    }
  } else {
    // Stepped limit logic for free users
    let cycle = toCount(activity.freeCooldownCycle);
    let cooldownEndStr = activity.freeCooldownEnd;
    const now = Date.now();

    if (cooldownEndStr) {
      const cooldownEndTime = new Date(cooldownEndStr).getTime();
      if (now >= cooldownEndTime) {
        // Cooldown period has passed! 
        // We effectively treat the user as having progressed to next cycle.
        cycle += 1;
        cooldownEndStr = null;
      } else {
        // Still in cooldown
        isFreePlanCooldown = true;
        nextAvailableAt = cooldownEndStr;
      }
    }

    limit = calculateFreeLimit(cycle);
    
    if (weightedCreditUsage >= MAX_FREE_CAP) {
      limit = MAX_FREE_CAP;
      isLocked = true;
      isFreePlanCooldown = false;
      nextAvailableAt = null; // Permanently locked
    } else {
      isLocked = weightedCreditUsage >= limit;

      // If they hit the limit but no cooldown is active, they are locked.
      if (isLocked && !isFreePlanCooldown) {
        // In UI/API, we show they are locked and predict cooldown will start.
        // The actual cooldown start time will be persisted by trackActivityEvent.
        const estimatedEnd = new Date(now + FREE_PLAN_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
        nextAvailableAt = estimatedEnd.toISOString();
        isFreePlanCooldown = true;
      }
    }
  }

  return {
    totalAIUsage: weightedCreditUsage,
    limit,
    hasPaidPlan: isExemptFromFreeLimit,
    isLocked,
    nextAvailableAt,
    isFreePlanCooldown,
  };
}
