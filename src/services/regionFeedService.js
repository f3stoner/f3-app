import { supabase } from "./supabaseClient.js";
import { mapSessionFromDb } from "./cloudData.js";

const DEFAULT_PAGE_SIZE = 25;

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

export async function loadRegionFeedPage({
    regionId,
    cursor = null,
    limit = DEFAULT_PAGE_SIZE,
}) {
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

    const { data, error } = await query;

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

    const finalItem =
        items[items.length - 1];

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