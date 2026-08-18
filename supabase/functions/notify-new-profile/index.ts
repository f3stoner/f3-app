import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const SUPABASE_URL =
  Deno.env.get("PROJECT_SUPABASE_URL") ||
  Deno.env.get("SUPABASE_URL");

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("PROJECT_SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error("Missing VAPID env vars.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

type ProfileRecord = {
  id: string;
  email: string | null;
  display_name: string | null;
  region_id: string;
  member_id: string | null;
  created_at: string;
  role: string | null;
};

type WebhookPayload = {
  type: "PROFILE_CLAIM";
  table: string;
  schema: string;
  record: ProfileRecord | null;
  old_record: ProfileRecord | null;
};

function getErrorStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    return Number(
      (error as { statusCode?: unknown }).statusCode
    );
  }

  return null;
}

async function deleteDeadSubscription(
  endpoint: string | null
) {
  if (!endpoint) return false;

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    console.warn(
      "Failed to delete dead subscription:",
      error
    );

    return false;
  }

  return true;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Method not allowed.",
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const payload =
      await req.json() as WebhookPayload;

    if (
      payload.type !== "PROFILE_CLAIM" ||
      payload.schema !== "public" ||
      payload.table !== "profiles" ||
      !payload.record
    ) {
      return new Response(
        JSON.stringify({
          ok: true,
          ignored: true,
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const profile = payload.record;

    const [
      { data: member, error: memberError },
      { data: region, error: regionError },
      { count: totalUsers, error: countError },
      { data: adminProfiles, error: adminProfilesError },
    ] = await Promise.all([
      profile.member_id
        ? supabase
            .from("members")
            .select("pax_name")
            .eq("id", profile.member_id)
            .maybeSingle()
        : Promise.resolve({
            data: null,
            error: null,
          }),

      supabase
        .from("regions")
        .select("name")
        .eq("id", profile.region_id)
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabase
        .from("profiles")
        .select("id")
        .eq("role", "superadmin"),
    ]);

    if (memberError) {
      console.warn(
        "Member lookup failed:",
        memberError
      );
    }

    if (regionError) {
      console.warn(
        "Region lookup failed:",
        regionError
      );
    }

    if (countError) {
      console.warn(
        "Profile count failed:",
        countError
      );
    }

    if (adminProfilesError) {
      throw adminProfilesError;
    }

    const adminUserIds = (adminProfiles || []).map(
      (adminProfile) => adminProfile.id
    );

    let subscriptions: Array<{
      endpoint: string | null;
      subscription: any;
      user_id: string;
    }> = [];

    if (adminUserIds.length > 0) {
      const {
        data,
        error: subscriptionsError,
      } = await supabase
        .from("push_subscriptions")
        .select(`
          endpoint,
          subscription,
          user_id
        `)
        .in("user_id", adminUserIds);

      if (subscriptionsError) {
        throw subscriptionsError;
      }

      subscriptions = data || [];
    }

    const paxName =
      member?.pax_name ||
      profile.display_name ||
      profile.email ||
      "New user";

    const regionName =
      region?.name ||
      "Unknown Region";

    const totalLabel =
      totalUsers === null
        ? "user total unavailable"
        : `${totalUsers} total users`;

    const notificationPayload =
      JSON.stringify({
        title: "New Q User",
        body:
          `${paxName} - ${regionName} - ${totalLabel}`,
        data: {
          app: "the-q",
          type: "new-profile",
          notificationType: "new_profile",
          profileId: profile.id,
          memberId: profile.member_id,
          regionId: profile.region_id,
          url: "/f3-app/?view=roster",
        },
      });

    let sent = 0;
    let failed = 0;
    let deletedDeadSubscriptions = 0;

    for (const subscriptionRow of subscriptions) {
      try {
        const result =
          await webpush.sendNotification(
            subscriptionRow.subscription,
            notificationPayload
          );

        console.log(
          `Sent new-profile alert to ${subscriptionRow.user_id}:`,
          result.statusCode
        );

        sent++;
      } catch (error) {
        failed++;

        const statusCode =
          getErrorStatusCode(error);

        if (
          statusCode === 404 ||
          statusCode === 410
        ) {
          const removed =
            await deleteDeadSubscription(
              subscriptionRow.endpoint
            );

          if (removed) {
            deletedDeadSubscriptions++;
          }
        }

        console.error(
          `Failed new-profile alert for ${subscriptionRow.user_id}:`,
          statusCode || error
        );
      }
    }

    console.log(
      "New profile notification:",
      {
        profileId: profile.id,
        paxName,
        regionName,
        totalUsers,
        adminProfiles:
          adminUserIds.length,
        subscriptions:
          subscriptions.length,
        sent,
        failed,
        deletedDeadSubscriptions,
      }
    );

    return new Response(
      JSON.stringify({
        ok: true,
        profileId: profile.id,
        paxName,
        regionName,
        totalUsers,
        adminProfiles:
          adminUserIds.length,
        subscriptions:
          subscriptions.length,
        sent,
        failed,
        deletedDeadSubscriptions,
      }),
      {
        headers: {
          "Content-Type":
            "application/json", 
        },
      }
    );
  } catch (error) {
    console.error(
      "notify-new-profile failed:",
      error
    );

    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});