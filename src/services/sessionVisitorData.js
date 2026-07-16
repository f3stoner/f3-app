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

export async function loadVisitorsForSessions(sessionIds = []) {
    const cleanSessionIds = [...new Set(sessionIds)].filter(Boolean);

    if (cleanSessionIds.length === 0) {
        return new Map();
    }

    const visitorsBySessionId = new Map();

    cleanSessionIds.forEach(sessionId => {
        visitorsBySessionId.set(sessionId, []);
    });

    const batchSize = 200;

    for (
        let index = 0;
        index < cleanSessionIds.length;
        index += batchSize
    ) {
        const batchIds = cleanSessionIds.slice(
            index,
            index + batchSize
        );

        const { data, error } = await supabase
            .from("session_visitors")
            .select("*")
            .in("session_id", batchIds)
            .order("created_at", { ascending: true });

        if (error) throw error;

        (data || []).forEach(row => {
            const visitor = {
                id: row.id,
                sessionId: row.session_id,
                f3Name: row.f3_name,
                homeRegion: row.home_region || "",
                realName: row.real_name || "",
                createdByUserId: row.created_by_user_id || null,
                createdAt: row.created_at,
            };

            const visitors =
                visitorsBySessionId.get(row.session_id) || [];

            visitors.push(visitor);

            visitorsBySessionId.set(
                row.session_id,
                visitors
            );
        });
    }

    return visitorsBySessionId;
}

export async function replaceSessionVisitors(
    sessionId,
    visitors = [],
    createdByUserId = null
) {
    if (!sessionId) return [];

    const cleanVisitors = visitors
        .map(visitor => ({
            id: visitor.id || null,
            f3Name: visitor.f3Name?.trim() || "",
            homeRegion: visitor.homeRegion?.trim() || "",
            realName: visitor.realName?.trim() || "",
            createdByUserId:
                visitor.createdByUserId ||
                createdByUserId ||
                null,
        }))
        .filter(visitor => visitor.f3Name);

    const { data, error } = await supabase.rpc(
        "replace_session_visitors",
        {
            p_session_id: sessionId,
            p_visitors: cleanVisitors,
            p_created_by_user_id: createdByUserId,
        }
    );

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