import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } =
  await supabase.auth.admin.updateUserById(
    "de479590-c8b0-4158-9532-10bb4f5e2c84",
    {
      password: "F3Shingles!2026",
    }
  );

if (error) {
  console.error(error);
} else {
  console.log(data.user);
}