import { supabase } from "./supabaseClient.js";

export async function loadSessionVisitors(sessionId) {
    if (!sessionId) return [];

    const { data, error } = await supabase
        .from("session_visitors")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function addSessionVisitor({
    sessionId,
    f3Name,
    homeRegion = "",
    realName = "",
    createdByUserId = null,
}) {
    const cleanF3Name = f3Name?.trim();

    if (!sessionId) throw new Error("Missing session ID.");
    if (!cleanF3Name) throw new Error("F3 name is required.");

    const { data, error } = await supabase
        .from("session_visitors")
        .insert({
            session_id: sessionId,
            f3_name: cleanF3Name,
            home_region: homeRegion.trim() || null,
            real_name: realName.trim() || null,
            created_by_user_id: createdByUserId,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteSessionVisitor(visitorId) {
    if (!visitorId) return;

    const { error } = await supabase
        .from("session_visitors")
        .delete()
        .eq("id", visitorId);

    if (error) throw error;
}