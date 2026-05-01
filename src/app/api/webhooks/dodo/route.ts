import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role key here — NOT the anon key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAN_KEY_MAP: Record<string, string> = {
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_MONTHLY_PRODUCT_ID?.trim() ?? ""]:    "pro_monthly",
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_YEARLY_PRODUCT_ID?.trim() ?? ""]:     "pro_yearly",
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_PLUS_MONTHLY_PRODUCT_ID?.trim() ?? ""]: "proplus_monthly",
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_PLUS_YEARLY_PRODUCT_ID?.trim() ?? ""]:  "proplus_yearly",
};

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const eventType = payload?.type as string;
  const data = payload?.data;

  console.log("Dodo webhook received:", eventType);

  try {
    if (eventType === "subscription.active" || eventType === "payment.succeeded") {
      const productId = data?.product_id ?? data?.product_cart?.[0]?.product_id;
      const customerEmail = data?.customer?.email || data?.customer_email;
      const subscriptionId = data?.subscription_id ?? data?.id ?? null;
      const customerId = data?.customer?.customer_id ?? null;
      const periodStart = data?.previous_billing_date ?? data?.created_at ?? new Date().toISOString();
      const periodEnd = data?.next_billing_date ?? data?.current_period_end ?? null;
      const planKey = PLAN_KEY_MAP[productId];

      if (!planKey || !customerEmail) {
        console.warn("Unknown product or missing email:", productId, customerEmail);
        return NextResponse.json({ received: true });
      }

      // Get user by email
      const { data: userData, error: userError } = await supabase.auth.admin
        .listUsers({ page: 1, perPage: 1000 });

      const user = userData?.users?.find(u => u.email === customerEmail);
      if (userError || !user) {
        console.error("User not found for email:", customerEmail);
        return NextResponse.json({ received: true });
      }

      // Upsert subscription in DB
      await supabase.from("user_subscription_plans").upsert({
        user_id: user.id,
        user_email: customerEmail,
        plan_key: planKey,
        plan_name: planKey.startsWith("proplus") ? "Pro+" : "Pro",
        billing_cycle: planKey.includes("yearly") ? "yearly" : "monthly",
        status: "active",
        provider: "dodopayments",
        provider_customer_id: customerId,
        provider_subscription_id: subscriptionId,
        provider_product_id: productId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        canceled_at: null,
        metadata: { source: "webhook", event: eventType },
      }, { onConflict: "user_id" });
    }

    if (eventType === "subscription.cancelled") {
      const customerEmail = data?.customer?.email;
      if (customerEmail) {
        await supabase.from("user_subscription_plans")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            cancel_at_period_end: false,
          })
          .eq("user_email", customerEmail);
      }
    }

    if (eventType === "payment.failed") {
      console.error("Runtime Error: Transaction failed", data);
      // Explicitly don't update anything in DB as requested
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}