import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const FORCE_TEST = false;
const SUPABASE_URL = Deno.env.get("PROJECT_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SUPABASE_SERVICE_ROLE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

const APP_TIME_ZONE = "America/Chicago";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase env vars.");
}

if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error("Missing VAPID env vars.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function getTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function formatDateKey(date = new Date()) {
  const { year, month, day } = getTimeParts(date);
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, daysToAdd: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0));
  return formatDateKey(date);
}

function isSundayNow() {
  return getTimeParts().weekday === "Sun";
}

function isAroundHour(targetHour: number, windowMinutes = 60) {
  const { hour, minute } = getTimeParts();
  const nowMinutes = hour * 60 + minute;
  const targetMinutes = targetHour * 60;

  return Math.abs(nowMinutes - targetMinutes) <= windowMinutes;
}

function buildNotificationKey({ type, slot }: { type: string; slot?: any }) {
  return `${type}_${slot?.id || "weekly"}_${slot?.date || ""}`;
}

function getNotificationType(reminder: any) {
  return reminder.type === "day-before"
    ? "day_before_q_reminder"
    : "weekly_q_summary";
}

function getNotificationIdempotencyKey(userId: string, reminder: any) {
  if (reminder.type === "day-before") {
    return `day_before_q_reminder:${userId}:${reminder.slot.id}`;
  }

  return `weekly_q_summary:${userId}:${reminder.key}`;
}

function getNotificationUrl(reminder: any) {
  return "/f3-app/?view=qSignup";
}

function getUpcomingRemindersForUser({
  qSlots,
  aos,
  currentUserMemberId,

}: {
  qSlots: any[];
  aos: any[];
  currentUserMemberId: string;

}) {
  const todayKey = formatDateKey();
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const weekEndKey = addDaysToDateKey(todayKey, 7);

  const reminders: any[] = [];
  const mySlots = qSlots
    .filter((slot) => slot.q_user_id === currentUserMemberId && slot.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  mySlots.forEach((slot) => {
    if (slot.date === tomorrowKey && (FORCE_TEST || isAroundHour(11))) {
      const ao = aos.find((a) => a.id === slot.ao_id);
      reminders.push({
        type: "day-before",
        slot,
        key: buildNotificationKey({ type: "day-before", slot }),
        title: `You're the Q tomorrow at ${ao?.name || "your AO"}`,
        body: "Don't forget to post your preblast.",
      });
    }
  });

  const weeklySlots = mySlots.filter(
    (slot) => slot.date >= todayKey && slot.date < weekEndKey
  );

  if (weeklySlots.length > 0 && (FORCE_TEST || (isSundayNow() && isAroundHour(17)))) {
    const summaryParts = weeklySlots.map((slot) => {
      const ao = aos.find((a) => a.id === slot.ao_id);
      const slotDate = new Date(`${slot.date}T12:00:00`);
      const shortDay = slotDate.toLocaleDateString(undefined, { weekday: "short" });
      return `${shortDay} @ ${ao?.name || "Unknown AO"}`;
    });

    reminders.push({
      type: "weekly-summary",
      slot: null,
      key: `weekly_${todayKey}`,
      title: "Your Q Schedule This Week",
      body:
        weeklySlots.length === 1
          ? `You're the Q ${summaryParts[0]}.`
          : `${weeklySlots.length} Qs this week: ${summaryParts.join(", ")}`,
    });
  }
  return reminders;
}

async function claimNotification(
  userId: string,
  reminder: any,
  payload: Record<string, unknown>
) {
  const notificationType = getNotificationType(reminder);
  const idempotencyKey = getNotificationIdempotencyKey(userId, reminder);

  const { data, error } = await supabase
    .from("notification_log")
    .insert({
      user_id: userId,
      q_slot_id: reminder.slot?.id || null,
      notification_type: notificationType,
      idempotency_key: idempotencyKey,
      status: "pending",
      payload,
      attempt_count: 1,
      metadata:
        reminder.type === "weekly-summary"
          ? { key: reminder.key, date_key: reminder.key }
          : { key: reminder.key },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { claimed: false, id: null };
    }

    throw error;
  }

  return { claimed: true, id: data.id };
}

async function markNotificationSent(
  notificationLogId: string,
  statusCode: number | null
) {
  const { error } = await supabase
    .from("notification_log")
    .update({
      status: "sent",
      webpush_status_code: statusCode,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationLogId);

  if (error) throw error;
}

async function markNotificationFailed(
  notificationLogId: string,
  error: unknown
) {
  const statusCode = getErrorStatusCode(error);
  const message = getErrorMessage(error);

  const { error: updateError } = await supabase
    .from("notification_log")
    .update({
      status: "failed",
      webpush_status_code: statusCode,
      error_message: message,
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationLogId);

  if (updateError) {
    console.warn("Failed to mark notification failure:", updateError);
  }
}

async function deleteDeadSubscription(
  endpoint: string | null
) {
  if (!endpoint) return false;

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) throw error;

  return true;
}

async function logFunctionRun({
  success,
  summary,
  error = null,
}: {
  success: boolean;
  summary: Record<string, unknown>;
  error?: string | null;
}) {
  const { error: insertError } = await supabase
    .from("function_runs")
    .insert({
      function_name: "send-reminders",
      success,
      summary,
      error,
    });

  if (insertError) {
    console.error("Failed to log function run:", insertError);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    return Number((error as { statusCode?: unknown }).statusCode);
  }

  return null;
}

serve(async () => {
  const todayKey = formatDateKey();
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const timeParts = getTimeParts();

  const summary = {
    todayKey,
    tomorrowKey,
    timeParts,
    checkedUsers: 0,
    generatedReminders: 0,
    qSlotsTomorrow: 0,
    pushUsersWithTomorrowQ: 0,
    sent: 0,
    skippedDuplicates: 0,
    failed: 0,
    deletedDeadSubscriptions: 0,
  };

  try {
    const [
      { data: settingsRows, error: settingsError },
      { data: qSlots, error: qSlotsError },
      { data: aos, error: aosError },
      { data: profiles, error: profilesError },

    ] = await Promise.all([
      supabase
        .from("notification_settings")
        .select(`
            user_id,
            push_enabled,
            push_subscriptions (
                endpoint,
                subscription
            )
        `)
        .eq("push_enabled", true),
      supabase
        .from("q_slots")
        .select("id, ao_id, date, q_user_id")
        .gte("date", todayKey)
        .lt("date", addDaysToDateKey(todayKey, 7)),      
      supabase.from("aos").select("id, name, time"),
      supabase.from("profiles").select("id, member_id"),
    ]);

    if (settingsError) throw settingsError;
    if (qSlotsError) throw qSlotsError;
    if (aosError) throw aosError;
    if (profilesError) throw profilesError;

    summary.qSlotsTomorrow = (qSlots || []).filter(
      (slot) => slot.date === tomorrowKey && slot.q_user_id
    ).length;
    
    summary.pushUsersWithTomorrowQ = (settingsRows || []).filter((settings) => {
      const profile = profiles?.find((p) => p.id === settings.user_id);
    
      return (qSlots || []).some(
        (slot) =>
          slot.q_user_id === profile?.member_id &&
          slot.date === tomorrowKey
      );
    }).length;

    for (const settings of settingsRows || []) {
      summary.checkedUsers++;

      const profile = profiles?.find((p) => p.id === settings.user_id);

      if (!profile?.member_id) {
        continue;
      }

      const reminders = getUpcomingRemindersForUser({
        qSlots: qSlots || [],
        aos: aos || [],
        currentUserMemberId: profile.member_id,
      });

      summary.generatedReminders += reminders.length;

      for (const reminder of reminders) {
        const payloadObject = {
          title: reminder.title,
          body: reminder.body,
          data: {
            app: "the-q",
            type: reminder.type,
            notificationType: getNotificationType(reminder),
            idempotencyKey: getNotificationIdempotencyKey(settings.user_id, reminder),
            key: reminder.key,
            qSlotId: reminder.slot?.id || null,
            date: reminder.slot?.date || formatDateKey(),
            aoId: reminder.slot?.ao_id || null,
            url: getNotificationUrl(reminder),
          },
        };

        const claim = await claimNotification(
          settings.user_id,
          reminder,
          payloadObject
        );

        if (!claim.claimed || !claim.id) {
          summary.skippedDuplicates++;
          continue;
        }

        const payload = JSON.stringify(payloadObject);

        const subscriptions =
            settings.push_subscriptions ?? [];

        if (subscriptions.length === 0) {
            continue;
        }

        let delivered = false;
        let lastStatusCode: number | null = null;

        for (const subscriptionRow of subscriptions) {
            try {
                const result =
                    await webpush.sendNotification(
                        subscriptionRow.subscription,
                        payload
                    );

                console.log(
                    `Sent ${reminder.type} to ${settings.user_id}:`,
                    result.statusCode
                );

                delivered = true;
                lastStatusCode = result.statusCode ?? null;

                summary.sent++;
            } catch (error) {
                const statusCode =
                    getErrorStatusCode(error);

                if (statusCode === 404 || statusCode === 410) {
                    const removed =
                        await deleteDeadSubscription(
                            subscriptionRow.endpoint
                        );

                    if (removed) {
                        summary.deletedDeadSubscriptions++;
                    }
                }

                summary.failed++;

                console.error(
                  `Failed ${reminder.type} for ${settings.user_id}:`,
                  statusCode || error
              );
            }
        }

        if (delivered) {
            await markNotificationSent(
                claim.id,
                lastStatusCode
            );
        } else {
            await markNotificationFailed(
                claim.id,
                new Error("Failed to deliver to all registered devices.")
            );
        }
      }
    }
    
    await logFunctionRun({
      success: true,
      summary,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        ranAt: new Date().toISOString(),
        summary,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    console.error("send-reminders failed:", error);

    await logFunctionRun({
      success: false,
      summary,
      error: errorMessage,
    });

    return new Response(
      JSON.stringify({
        ok: false,
        error: errorMessage,
        ranAt: new Date().toISOString(),
        summary,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
});