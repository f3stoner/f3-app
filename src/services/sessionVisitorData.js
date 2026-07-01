import { supabase } from "./supabaseClient.js";

export async function loadSessionVisitors(sessionId) {
    if (!sessionId) return [];

    const { data, error } = await supabase
        .from("session_visitors")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
        id: row.id,
        sessionId: row.session_id,
        f3Name: row.f3_name,
        homeRegion: row.home_region || "",
        realName: row.real_name || "",
        createdByUserId: row.created_by_user_id || null,
        createdAt: row.created_at,
    }));
}

export async function replaceSessionVisitors(sessionId, visitors = [], createdByUserId = null) {
    if (!sessionId) return [];

    const { error: deleteError } = await supabase
        .from("session_visitors")
        .delete()
        .eq("session_id", sessionId);

    if (deleteError) throw deleteError;

    const cleanVisitors = visitors
        .map(visitor => ({
            session_id: sessionId,
            f3_name: visitor.f3Name?.trim(),
            home_region: visitor.homeRegion?.trim() || null,
            real_name: visitor.realName?.trim() || null,
            created_by_user_id: visitor.createdByUserId || createdByUserId || null,
        }))
        .filter(visitor => visitor.f3_name);

    if (cleanVisitors.length === 0) return [];

    const { data, error } = await supabase
        .from("session_visitors")
        .insert(cleanVisitors)
        .select();

    if (error) throw error;

    return data || [];
}