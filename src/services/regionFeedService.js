import { supabase } from "./supabaseClient.js";
import { mapSessionFromDb } from "./cloudData.js";

const DEFAULT_PAGE_SIZE = 25;

export const REGION_FEED_REACTION_TYPES = [
    "like",
    "strong",
    "fire",
    "applause",
    "heart",
];

function createEmptyReactionCounts() {
    return Object.fromEntries(
        REGION_FEED_REACTION_TYPES.map(type => [type, 0])
    );
}

/*
 * Map one regional feed comment from its database shape.
 */
function mapRegionFeedCommentFromDb(row) {
    return {
        id: row.id,
        feedEventId: row.feed_event_id,
        memberId: row.member_id,
        body: row.body || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        member: row.members
            ? {
                id: row.members.id,
                paxName: row.members.pax_name || "",
                realName: row.members.real_name || "",
            }
            : null,
    };
}


function mapRegionFeedEventFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        eventType: row.event_type,
        occurredAt: row.occurred_at,
        createdAt: row.created_at,
        sessionId: row.session_id,
        memberId: row.member_id,
        payload: row.payload || {},
        sourceKey: row.source_key,
        reactionCounts: createEmptyReactionCounts(),
        reactionTotal: 0,
        currentReaction: null,
        commentCount: 0,
        member: row.members
            ? {
                id: row.members.id,
                paxName: row.members.pax_name || "",
                realName: row.members.real_name || "",
            }
            : null,
        announcementId: row.announcement_id,
        announcement: row.announcements
            ? {
                id: row.announcements.id,
                regionId: row.announcements.region_id,
                title: row.announcements.title || "",
                body: row.announcements.body || "",
                startsOn: row.announcements.starts_on || null,
                endsOn: row.announcements.ends_on || null,
                isActive: row.announcements.is_active ?? true,
                createdByUserId: row.announcements.created_by_user_id || null,
                createdAt: row.announcements.created_at || null,
                updatedAt: row.announcements.updated_at || null,
                linkUrl: row.announcements.link_url || "",
                linkLabel: row.announcements.link_label || "",
            }
            : null,
        session: row.sessions
            ? mapSessionFromDb(row.sessions)
            : null,
    };
}

function createCursorFilter(cursor) {
    if (
        !cursor?.occurredAt ||
        !cursor?.id
    ) {
        return null;
    }

    return [
        `occurred_at.lt.${cursor.occurredAt}`,
        `and(` +
            `occurred_at.eq.${cursor.occurredAt},` +
            `id.lt.${cursor.id}` +
        `)`,
    ].join(",");
}

/*
 * Load compact social metadata for one page of feed events.
 *
 * Reaction rows and comment bodies stay off the feed's
 * primary event payload.
 */
async function loadRegionFeedSocialSummary(feedEventIds) {
    const summaryByEventId = new Map();

    if (!feedEventIds.length) {
        return summaryByEventId;
    }

    console.log(
        "regionFeed:socialSummaryRpc:start",
        {
            eventCount:
                feedEventIds.length,
        }
    );
    
    const socialSummaryStartedAt =
        performance.now();

    const { data, error } = await supabase.rpc(
        "get_region_feed_social_summary",
        {
            p_feed_event_ids: feedEventIds,
        }
    );

    console.log(
        "regionFeed:socialSummaryRpc:complete",
        {
            durationMs:
                Math.round(
                    performance.now() -
                        socialSummaryStartedAt
                ),
            rowCount:
                data?.length || 0,
            error,
        }
    );

    if (error) {
        console.error(
            "Failed to load regional feed social summary:",
            {
                feedEventIds,
                error,
            }
        );

        throw error;
    }

    (data || []).forEach(summary => {
        summaryByEventId.set(
            summary.feed_event_id,
            summary
        );
    });

    return summaryByEventId;
}

export async function loadRegionFeedPage({
    regionId,
    cursor = null,
    limit = DEFAULT_PAGE_SIZE,
}) {
    console.log(
        "regionFeed:loadPage:start",
        {
            regionId,
            cursor,
            limit,
        }
    );

    if (!regionId) {
        throw new Error(
            "Region id is required to load the feed."
        );
    }

    const safeLimit = Math.min(
        Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1),
        50
    );

    let query = supabase
        .from("region_feed_events")
        .select(`
            id,
            region_id,
            event_type,
            occurred_at,
            created_at,
            session_id,
            member_id,
            payload,
            members (
                id,
                pax_name,
                real_name
            ),
            announcement_id,
            announcements (
                id,
                region_id,
                title,
                body,
                starts_on,
                ends_on,
                is_active,
                created_by_user_id,
                created_at,
                updated_at,
                link_url,
                link_label
            ),
            source_key,
            sessions (
                id,
                region_id,
                date,
                ao_id,
                site_id,
                ao_name,
                start_time,
                attendee_ids,
                q_ids,
                q_id,
                fngs,
                notes,
                workout,
                source_planned_workout_id,
                source_q_slot_id,
                created_at,
                created_by_user_id,
                backblast_text,
                backblast_hashtags_text,
                backblast_intro_text,
                backblast_body_text,
                backblast_status,
                backblast_posted_at,
                unresolved_pax,
                weather_snapshot,
                attendance_review_status,
                attendance_review_notes,
                announcement_text,
                announcement_snapshot
            )
        `)
        .eq("region_id", regionId)
        .order("occurred_at", {
            ascending: false,
        })
        .order("id", {
            ascending: false,
        })
        .limit(safeLimit + 1);

    const cursorFilter =
        createCursorFilter(cursor);

    if (cursorFilter) {
        query = query.or(cursorFilter);
    }

    console.log(
        "regionFeed:eventQuery:start",
        {
            regionId,
            cursor,
        }
    );
    
    const eventQueryStartedAt =
        performance.now();
    
    const { data, error } = await query;
    
    console.log(
        "regionFeed:eventQuery:complete",
        {
            durationMs:
                Math.round(
                    performance.now() -
                        eventQueryStartedAt
                ),
            rowCount:
                data?.length || 0,
            error,
        }
    );

    if (error) {
        console.error(
            "Failed to load regional feed:",
            {
                regionId,
                cursor,
                error,
            }
        );

        throw error;
    }

    const rows = data || [];
    const hasMore =
        rows.length > safeLimit;

    const pageRows =
        hasMore
            ? rows.slice(0, safeLimit)
            : rows;
    
    const items =
        pageRows.map(
            mapRegionFeedEventFromDb
        );

    const feedEventIds =
        items
            .map(item => item.id)
            .filter(Boolean);

        console.log(
            "regionFeed:socialSummary:aboutToLoad",
            {
                itemCount:
                    items.length,
                idCount:
                    feedEventIds.length,
                feedEventIds,
            }
        );
    
    const socialSummary =
        await loadRegionFeedSocialSummary(
            feedEventIds
        );
    
    items.forEach(item => {
        const summary =
            socialSummary.get(item.id);
    
        if (!summary) return;
    
        item.reactionCounts = {
            like:
                Number(summary.like_count) || 0,
            strong:
                Number(summary.strong_count) || 0,
            fire:
                Number(summary.fire_count) || 0,
            applause:
                Number(summary.applause_count) || 0,
            heart:
                Number(summary.heart_count) || 0,
        };
    
        item.reactionTotal =
            Object.values(
                item.reactionCounts
            ).reduce(
                (total, count) =>
                    total + count,
                0
            );
    
        item.currentReaction =
            summary.current_reaction || null;
    
        item.commentCount =
            Number(summary.comment_count) || 0;
    });
    
    const finalItem =
        items[items.length - 1];

        console.log(
            "regionFeed:loadPage:complete",
            {
                itemCount:
                    items.length,
                hasMore,
            }
        );

    return {
        items,
        hasMore,
        nextCursor:
            hasMore && finalItem
                ? {
                    occurredAt:
                        finalItem.occurredAt,
                    id:
                        finalItem.id,
                }
                : null,
    };
}

export async function setRegionFeedReaction({
    feedEventId,
    reactionType,
}) {
    if (!feedEventId) {
        throw new Error(
            "Feed event id is required to set a reaction."
        );
    }

    if (!REGION_FEED_REACTION_TYPES.includes(reactionType)) {
        throw new Error(
            "A valid reaction type is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "set_region_feed_reaction",
        {
            p_feed_event_id: feedEventId,
            p_reaction_type: reactionType,
        }
    );

    if (error) {
        console.error(
            "Failed to set regional feed reaction:",
            {
                feedEventId,
                reactionType,
                error,
            }
        );

        throw error;
    }

    return data;
}

/*
 * Load one feed event's active comments only when its
 * discussion is opened.
 */
export async function loadRegionFeedComments(
    feedEventId
) {
    if (!feedEventId) {
        throw new Error(
            "Feed event id is required to load comments."
        );
    }

    const { data, error } = await supabase
        .from("region_feed_comments")
        .select(`
            id,
            feed_event_id,
            member_id,
            body,
            created_at,
            updated_at,
            members (
                id,
                pax_name,
                real_name
            )
        `)
        .eq("feed_event_id", feedEventId)
        .order("created_at", {
            ascending: true,
        })
        .order("id", {
            ascending: true,
        });

    if (error) {
        console.error(
            "Failed to load regional feed comments:",
            {
                feedEventId,
                error,
            }
        );

        throw error;
    }

    return (data || []).map(
        mapRegionFeedCommentFromDb
    );
}

export async function addRegionFeedComment({
    feedEventId,
    body,
}) {
    const cleanBody =
        String(body || "").trim();

    if (!feedEventId) {
        throw new Error(
            "Feed event id is required to add a comment."
        );
    }

    if (!cleanBody) {
        throw new Error(
            "Comment body is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "add_region_feed_comment",
        {
            p_feed_event_id: feedEventId,
            p_body: cleanBody,
        }
    );

    if (error) {
        console.error(
            "Failed to add regional feed comment:",
            {
                feedEventId,
                error,
            }
        );

        throw error;
    }

    return data;
}

export async function deleteRegionFeedComment(
    commentId
) {
    if (!commentId) {
        throw new Error(
            "Comment id is required to delete a comment."
        );
    }

    const { error } = await supabase.rpc(
        "delete_region_feed_comment",
        {
            p_comment_id: commentId,
        }
    );

    if (error) {
        console.error(
            "Failed to delete regional feed comment:",
            {
                commentId,
                error,
            }
        );

        throw error;
    }
}