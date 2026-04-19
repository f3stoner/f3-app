import "dotenv/config";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: node sendTestPush.mjs <userId>");
  process.exit(1);
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const { data, error } = await supabase
  .from("notification_settings")
  .select("push_enabled, push_subscription")
  .eq("user_id", userId)
  .single();

if (error) {
  console.error("Failed to load notification settings:", error);
  process.exit(1);
}

if (!data?.push_enabled) {
  console.error("Push is not enabled for this user.");
  process.exit(1);
}

if (!data?.push_subscription) {
  console.error("No push subscription found for this user.");
  process.exit(1);
}

const payload = JSON.stringify({
  title: "F3 Reminder",
  body: "You are Qing tomorrow at The Hub. Don’t forget to post a preblast.",
});

try {
  const result = await webpush.sendNotification(data.push_subscription, payload);
  console.log("Push sent:", result.statusCode);
} catch (err) {
  console.error("Push failed:", err);
  process.exit(1);
}