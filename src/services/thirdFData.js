import { supabase } from "./supabaseClient.js";

function mapThirdFDiscussionFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        weekStartDate: row.week_start_date,
        title: row.title || "",
        type: row.type || "discussion",
        summary: row.summary || "",
        discussion: row.discussion || "",
        link: row.link || "",
        published: row.published === true,
        createdByUserId: row.created_by_user_id || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

function mapThirdFDiscussionToRpcPayload(discussion) {
    return {
        p_id: discussion.id || null,
        p_region_id: discussion.regionId,
        p_week_start_date: discussion.weekStartDate,
        p_title: discussion.title,
        p_type: discussion.type || "discussion",
        p_summary: discussion.summary || null,
        p_discussion: discussion.discussion || null,
        p_link: discussion.link || null,
        p_published: discussion.published === true,
    };
}

export async function loadThirdFDiscussions(regionId) {
    const { data, error } = await supabase.rpc("load_third_f_discussions", {
        p_region_id: regionId,
    });

    if (error) throw error;

    return (data || []).map(mapThirdFDiscussionFromDb);
}

export async function loadThirdFDiscussionsForAdmin(regionId) {
    const { data, error } = await supabase.rpc("load_third_f_discussions_for_admin", {
        p_region_id: regionId,
    });

    if (error) throw error;

    return (data || []).map(mapThirdFDiscussionFromDb);
}

export async function saveThirdFDiscussion(discussion) {
    const { data, error } = await supabase.rpc(
        "save_third_f_discussion",
        mapThirdFDiscussionToRpcPayload(discussion)
    );

    if (error) throw error;

    return mapThirdFDiscussionFromDb(data);
}

export async function deleteThirdFDiscussion(regionId, discussionId) {
    const { error } = await supabase.rpc("delete_third_f_discussion", {
        p_id: discussionId,
        p_region_id: regionId,
    });

    if (error) throw error;

    return true;
}