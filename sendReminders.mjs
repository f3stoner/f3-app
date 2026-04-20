import "dotenv/config";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const FORCE_TEST = false;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

function isSundayNow() {
  return new Date().getDay() === 0;
}

function isAroundHour(targetHour, windowMinutes = 30) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(targetHour, 0, 0, 0);
  return Math.abs(now - target) <= windowMinutes * 60 * 1000;
}

function buildNotificationKey({ type, slot }) {
  return `${type}_${slot?.id || "weekly"}_${slot?.date || ""}`;
}

function getUpcomingRemindersForUser({ qSlots, aos, currentUserMemberId }) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const todayKey = formatDateKey(today);
  const tomorrowKey = formatDateKey(tomorrow);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const weekEndKey = formatDateKey(weekEnd);

  console.log("---- reminder debug ----");

  console.log("currentUserMemberId:", currentUserMemberId);

  console.log("todayKey:", todayKey);

  console.log("tomorrowKey:", tomorrowKey);

  console.log("weekEndKey:", weekEndKey);

  console.log("isSundayNow:", isSundayNow());

  console.log("isAroundHour(11):", isAroundHour(11));

  console.log("isAroundHour(17):", isAroundHour(17));

  const reminders = [];
  const mySlots = qSlots
    .filter(
      (slot) => slot.q_user_id === currentUserMemberId && slot.date >= todayKey
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  mySlots.forEach((slot) => {
    if (slot.date === tomorrowKey && (FORCE_TEST || isAroundHour(11))) {
      const ao = aos.find((a) => a.id === slot.ao_id);
      reminders.push({
        type: "day-before",
        slot,
        key: buildNotificationKey({ type: "day-before", slot }),
        title: "F3 Reminder",
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

    const weeklyMessage =
      weeklySlots.length === 1
        ? `You are Qing this week: ${summaryParts[0]}`
        : `You are Qing ${weeklySlots.length}x this week: ${summaryParts.join(", ")}`;
    reminders.push({
      type: "weekly-summary",
      slot: null,
      key: `weekly_${todayKey}`,
      title: "F3 Reminder",
      body: weeklyMessage,
    });
  }

  return reminders;
}

async function alreadySent(userId, reminder) {
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

async function logSent(userId, reminder) {
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

async function clearDeadSubscription(userId) {
  const { error } = await supabase
    .from("notification_settings")
    .update({
      push_enabled: false,
      push_subscription: null,
    })
    .eq("user_id", userId);
  if (error) throw error;
}

async function run() {
  let sentCount = 0;

  const [{ data: settingsRows, error: settingsError }, { data: qSlots, error: qSlotsError }, { data: aos, error: aosError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase
        .from("notification_settings")
        .select("user_id, push_enabled, push_subscription")
        .eq("push_enabled", true)
        .not("push_subscription", "is", null),
      supabase.from("q_slots").select("id, ao_id, date, q_user_id"),
      supabase.from("aos").select("id, name"),
      supabase.from("profiles").select("id, member_id"),
    ]);
  if (settingsError) throw settingsError;
  if (qSlotsError) throw qSlotsError;
  if (aosError) throw aosError;
  if (profilesError) throw profilesError;

  console.log("Reminder job started:", new Date().toISOString());
  console.log("Eligible notification settings count:", settingsRows.length);

  for (const settings of settingsRows) {
    const profile = profiles.find((p) => p.id === settings.user_id);
    
    console.log("Processing user:", settings.user_id);

    console.log("Matched profile:", profile);
    
    if (!profile?.member_id) continue;
    
    const reminders = getUpcomingRemindersForUser({
          qSlots,
          aos,
          currentUserMemberId: profile.member_id,
        });
    console.log("Generated reminders:", reminders);
    for (const reminder of reminders) {
        console.log("Checking reminder:", reminder.type, reminder.body);
      const sent = await alreadySent(settings.user_id, reminder);
      console.log("Already sent?", sent);
      if (sent) continue;
      const payload = JSON.stringify({
        title: reminder.title,
        body: reminder.body,
      });

      try {
        const result = await webpush.sendNotification(
          settings.push_subscription,
          payload
        );
        console.log(`Sent ${reminder.type} to ${settings.user_id}:`, result.statusCode);
        sentCount++;
        await logSent(settings.user_id, reminder);
      } catch (err) {
        console.error(`Failed ${reminder.type} for ${settings.user_id}:`, err.statusCode || err);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await clearDeadSubscription(settings.user_id);
        }
      }
    }
  }
  console.log("Reminder job finished. Sent:", sentCount);
}
run().catch((err) => {
  console.error("Reminder run failed:", err);
  process.exit(1);
});