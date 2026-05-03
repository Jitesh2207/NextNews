import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DodoPayments } from "dodopayments";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey);
}

const PLAN_KEY_MAP: Record<string, string> = {
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_MONTHLY_PRODUCT_ID?.trim() ?? ""]: "pro_monthly",
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_YEARLY_PRODUCT_ID?.trim() ?? ""]: "pro_yearly",
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_PLUS_MONTHLY_PRODUCT_ID?.trim() ?? ""]: "proplus_monthly",
  [process.env.DODO_PAYMENT_NEXTNEWS_PRO_PLUS_YEARLY_PRODUCT_ID?.trim() ?? ""]: "proplus_yearly",
};

function getDodoClient() {
  const webhookKey =
    process.env.DODO_PAYMENT_WEBHOOK_KEY?.trim() ||
    process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() ||
    "";

  return new DodoPayments({
    bearerToken: process.env.DODO_PAYMENT_API_KEY,
    environment:
      process.env.DODO_PAYMENT_ENVIRONMENT === "test_mode" ? "test_mode" : "live_mode",
    webhookKey: webhookKey || undefined,
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers = {
    "webhook-id": req.headers.get("webhook-id") ?? "",
    "webhook-signature": req.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
  };

  const dodo = getDodoClient();
  const webhookKey = dodo.webhookKey;

  if (!webhookKey) {
    console.error("Missing DODO_PAYMENT_WEBHOOK_KEY/DODO_PAYMENTS_WEBHOOK_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let payload: { type: string; data: any };
  try {
    payload = dodo.webhooks.unwrap(rawBody, { headers }) as { type: string; data: any };
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventType = payload?.type as string;
  const data = payload?.data;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  try {
    // Grant access ONLY on subscription.active
    if (eventType === "subscription.active") {
      const productId = data?.product_id ?? data?.product_cart?.[0]?.product_id;
      const customerEmail = data?.customer?.email || data?.customer_email;
      const subscriptionId = data?.subscription_id ?? data?.id ?? null;
      const customerId = data?.customer?.customer_id ?? null;
      const periodStart =
        data?.previous_billing_date ?? data?.created_at ?? new Date().toISOString();
      const periodEnd = data?.next_billing_date ?? data?.current_period_end ?? null;
      const planKey = PLAN_KEY_MAP[productId];

      if (!planKey || !customerEmail) {
        console.warn("Unknown product or missing email:", productId, customerEmail);
        return NextResponse.json({ received: true });
      }

      const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
      const user = userData?.users?.find((u) => u.email === customerEmail);
      if (userError || !user) {
        console.error("User not found for email:", customerEmail);
        return NextResponse.json({ received: true, warning: "User not found" });
      }

      const { error: upsertError } = await supabase
        .from("user_subscription_plans")
        .upsert(
          {
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
            metadata: {
              source: "webhook",
              event: eventType,
              received_at: new Date().toISOString(),
            },
          },
          { onConflict: "user_id" }
        );

      if (upsertError) {
        console.error("Error updating subscription:", upsertError);
        return NextResponse.json({ error: "Database update failed" }, { status: 500 });
      }
    }

    // Keep DB in sync for negative or lifecycle events
    if (eventType === "subscription.cancelled" || eventType === "subscription.failed") {
      const customerEmail = data?.customer?.email || data?.customer_email;
      if (customerEmail) {
        const newStatus = eventType === "subscription.cancelled" ? "canceled" : "failed";
        await supabase
          .from("user_subscription_plans")
          .update({
            status: newStatus,
            canceled_at: newStatus === "canceled" ? new Date().toISOString() : null,
            cancel_at_period_end: false,
          })
          .eq("user_email", customerEmail);
      }
    }

    if (eventType === "subscription.on_hold") {
      const customerEmail = data?.customer?.email || data?.customer_email;
      if (customerEmail) {
        await supabase
          .from("user_subscription_plans")
          .update({
            status: "on_hold",
          })
          .eq("user_email", customerEmail);
      }
    }

    if (eventType === "subscription.expired") {
      const customerEmail = data?.customer?.email || data?.customer_email;
      if (customerEmail) {
        await supabase
          .from("user_subscription_plans")
          .update({
            status: "expired",
            current_period_end: new Date().toISOString(),
          })
          .eq("user_email", customerEmail);
      }
    }

    // Do NOT grant access on payment.succeeded — only record if needed.
    if (eventType === "payment.succeeded") {
      console.log("Payment succeeded — awaiting subscription.active to grant access.");
    }

    if (eventType === "payment.failed") {
      console.error("Payment failed event received:", data);
      // Intentionally no DB grant here. Access is allowed only on subscription.active.
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
