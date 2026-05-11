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
        title: "The Q",
        body: `You are Qing tomorrow at ${ao?.name || "your AO"} - don't forget to post a preblast.`,
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
      title: "The Q",
      body:
        weeklySlots.length === 1
          ? `You are Qing this week: ${summaryParts[0]}`
          : `You are Qing ${weeklySlots.length}x this week: ${summaryParts.join(", ")}`,
    });
  }
  return reminders;
}

async function alreadySent(userId: string, reminder: any) {
  if (reminder.type === "day-before" && reminder.slot?.id) {
    const { data, error } = await supabase
      .from("notification_log")
      .select("id")
      .eq("user_id", userId)
      .eq("q_slot_id", reminder.slot.id)
      .eq("notification_type", "day_before_q_reminder")
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  if (reminder.type === "weekly-summary") {
    const todayKey = formatDateKey(new Date());

    const { data, error } = await supabase
      .from("notification_log")
      .select("id")
      .eq("user_id", userId)
      .eq("notification_type", "weekly_q_summary")
      .contains("metadata", { date_key: todayKey })
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  return false;
}

async function logSent(userId: string, reminder: any) {
  const payload = {
    user_id: userId,
    q_slot_id: reminder.slot?.id || null,
    notification_type:
      reminder.type === "day-before"
        ? "day_before_q_reminder"
        : "weekly_q_summary",

    metadata:
      reminder.type === "weekly-summary"
        ? { key: reminder.key, date_key: formatDateKey(new Date()) }
        : { key: reminder.key },
  };
  const { error } = await supabase.from("notification_log").insert(payload);
  if (error) throw error;
}

async function clearDeadSubscription(userId: string) {
  const { error } = await supabase
    .from("notification_settings")
    .update({
      push_enabled: false,
      push_subscription: null,
    })
    .eq("user_id", userId);
  if (error) throw error;
}

serve(async () => {
  const summary = {
    checkedUsers: 0,
    generatedReminders: 0,
    sent: 0,
    skippedDuplicates: 0,
    failed: 0,
    disabledDeadSubscriptions: 0,
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
        .select("user_id, push_enabled, push_subscription")
        .eq("push_enabled", true)
        .not("push_subscription", "is", null),
      supabase.from("q_slots").select("id, ao_id, date, q_user_id"),
      supabase.from("aos").select("id, name, time"),
      supabase.from("profiles").select("id, member_id"),
    ]);

    if (settingsError) throw settingsError;

    if (qSlotsError) throw qSlotsError;

    if (aosError) throw aosError;

    if (profilesError) throw profilesError;

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
        const sent = await alreadySent(settings.user_id, reminder);

        if (sent) {
          summary.skippedDuplicates++;
          continue;
        }

        const payload = JSON.stringify({
          title: reminder.title,
          body: reminder.body,
          data: {
            type: reminder.type,
            key: reminder.key,
            qSlotId: reminder.slot?.id || null,
          },
        });

        try {
          const result = await webpush.sendNotification(
            settings.push_subscription,
            payload
          );

          console.log(
            `Sent ${reminder.type} to ${settings.user_id}:`,
            result.statusCode
          );

          summary.sent++;

          await logSent(settings.user_id, reminder);

        } catch (error) {
          console.error(
            `Failed ${reminder.type} for ${settings.user_id}:`,
            error?.statusCode || error
          );
          summary.failed++;

          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await clearDeadSubscription(settings.user_id);
            summary.disabledDeadSubscriptions++;
          }
        }
      }
    }

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
    console.error("send-reminders failed:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || String(error),
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