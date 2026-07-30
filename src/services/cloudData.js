import { APP_EVENTS } from "../constants/appEvents.js";
import { logAppEvent } from "./appEvents.js";
import { supabase } from "./supabaseClient.js";
import { AO_WORKOUT_EMPHASIS_RULES } from "../config.js";
import { subscribeToManagedChannel, unsubscribeManagedChannel } from "./realtime.js";
import { getTodayDate } from "../utils/date.js";
import { resolveActiveAnnouncements } from "../utils/announcements.js";
import { loadVisitorsForSessions } from "./sessionVisitorData.js";

export async function loadAllSessionsPaginated(regionId) {
    const pageSize = 1000;
    let from = 0;
    let allSessions = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select(`
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
                source_planned_workout_id,
                source_q_slot_id,
                created_at,
                created_by_user_id,
                unresolved_pax
            `)
            .eq("region_id", regionId)
            .order("date", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allSessions = allSessions.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return allSessions;
}

export async function loadRecentSessions(regionId, days = 180) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const cutoff = cutoffDate.toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("sessions")
        .select(`
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
        `)
        .eq("region_id", regionId)
        .gte("date", cutoff)
        .order("date", { ascending: false });

    if (error) throw error;

    return data || [];
}

export async function loadMatchingSessions({
    regionId,
    mode,
    memberIds = [],
    limit = 250,
}) {
    const cleanMemberIds = [
        ...new Set(memberIds),
    ].filter(Boolean);

    if (
        !regionId ||
        cleanMemberIds.length === 0
    ) {
        return [];
    }

    const sessionSelect = `
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
    `;

    let rows = [];

    if (mode === "q") {
        const [
            arrayResult,
            legacyResult,
        ] = await Promise.all([
            supabase
                .from("sessions")
                .select(sessionSelect)
                .eq("region_id", regionId)
                .overlaps(
                    "q_ids",
                    cleanMemberIds
                )
                .order("date", {
                    ascending: false,
                })
                .order("created_at", {
                    ascending: false,
                })
                .limit(limit),

            supabase
                .from("sessions")
                .select(sessionSelect)
                .eq("region_id", regionId)
                .in(
                    "q_id",
                    cleanMemberIds
                )
                .order("date", {
                    ascending: false,
                })
                .order("created_at", {
                    ascending: false,
                })
                .limit(limit),
        ]);

        if (arrayResult.error) {
            throw arrayResult.error;
        }

        if (legacyResult.error) {
            throw legacyResult.error;
        }

        rows = [
            ...(arrayResult.data || []),
            ...(legacyResult.data || []),
        ];
    } else if (mode === "attendee") {
        const attendeeFilters = cleanMemberIds
            .map(
                memberId =>
                    `attendee_ids.cs.["${memberId}"]`
            )
            .join(",");
    
        const { data, error } = await supabase
            .from("sessions")
            .select(sessionSelect)
            .eq("region_id", regionId)
            .or(attendeeFilters)
            .order("date", {
                ascending: false,
            })
            .order("created_at", {
                ascending: false,
            })
            .limit(limit);
    
        if (error) throw error;
    
        rows = data || [];
    } else {
        return [];
    }

    const sessionsById = new Map();

    rows.forEach(row => {
        sessionsById.set(
            row.id,
            mapSessionFromDb(row)
        );
    });

    return [...sessionsById.values()]
        .sort((a, b) => {
            if (a.date !== b.date) {
                return b.date.localeCompare(
                    a.date
                );
            }

            return (
                (b.createdAt || 0) -
                (a.createdAt || 0)
            );
        });
}

export async function loadOlderSessionsPage(regionId, beforeDate, limit = 100) {
    if (!regionId || !beforeDate) return [];

    const { data, error } = await supabase
        .from("sessions")
        .select(`
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
        `)
        .eq("region_id", regionId)
        .lte("date", beforeDate)
        .order("date", { ascending: false })
        .limit(limit);
    
    if (error) throw error;

    return (data || []).map(mapSessionFromDb);
}

export async function loadSessionsByIds(sessionIds = []) {
    const cleanIds = [...new Set(sessionIds)].filter(Boolean);

    if (cleanIds.length === 0) return [];

    const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .in("id", cleanIds);

    if (error) throw error;

    return (data || []).map(mapSessionFromDb);
}

export async function getSessionById(sessionId) {
    const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

    if (error) throw error;

    return mapSessionFromDb(data);
}

export async function loadAllMembers(regionId) {
    const pageSize = 1000;
    let from = 0;
    let allMembers = [];

    while(true) {
        const { data, error } = await supabase
            .from("members")
            .select("*")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;

        if (!data) break;

        allMembers = allMembers.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return allMembers;
}

export async function loadMemberInviters(memberIds = []) {
    const cleanMemberIds = [...new Set(memberIds)].filter(Boolean);

    if (cleanMemberIds.length === 0) return [];

    const batchSize = 500;
    const batches = [];

    for (
        let index = 0;
        index < cleanMemberIds.length;
        index += batchSize
    ) {
        batches.push(
            cleanMemberIds.slice(index, index + batchSize)
        );
    }

    const batchResults = await Promise.all(
        batches.map(async batchIds => {
            const { data, error } = await supabase
                .from("member_inviters")
                .select(`
                    member_id,
                    inviter_member_id,
                    source,
                    source_metadata,
                    created_at
                `)
                .in("member_id", batchIds)
                .order("created_at", { ascending: true });

            if (error) throw error;

            return data || [];
        })
    );

    const allRelationships = batchResults.flat();

    return allRelationships.map(row => ({
        memberId: row.member_id,
        inviterMemberId: row.inviter_member_id,
        source: row.source || "",
        sourceMetadata: row.source_metadata || {},
        createdAt: row.created_at || null,
    }));
}

export async function loadMemberInvitersForRegion(regionId) {
    if (!regionId) return [];

    const { data, error } = await supabase.rpc(
        "load_region_member_inviters",
        {
            p_region_id: regionId,
        }
    );

    if (error) throw error;

    return (data || []).map(row => ({
        memberId: row.member_id,
        inviterMemberId: row.inviter_member_id,
        source: row.source || "",
        sourceMetadata: row.source_metadata || {},
        createdAt: row.created_at || null,
    }));
}

export async function loadAllQSlots(regionId) {
    const pageSize = 1000;
    let from = 0;
    let allQSlots = [];

    while (true) {
        const { data, error } = await supabase
            .from("q_slots")
            .select("*")
            .eq("region_id", regionId)
            .order("date", { ascending: true })
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allQSlots= allQSlots.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return allQSlots;
}

function mapQSlotCommitmentSummaryFromDb(row) {
    return {
        qSlotId: row.q_slot_id,
        hcCount: Number(row.hc_count || 0),
        scCount: Number(row.sc_count || 0),
        myCommitment:
            row.my_commitment === "hc" ||
            row.my_commitment === "sc"
                ? row.my_commitment
                : null,
    };
}

function mapQSlotCommitmentFromDb(row) {
    return {
        commitmentId: row.commitment_id,
        qSlotId: row.q_slot_id,
        memberId: row.member_id,
        paxName: row.pax_name || "",
        realName: row.real_name || "",
        homeAo: row.home_ao || "",
        commitmentType: row.commitment_type,
        source: row.source,
        createdBy: row.created_by || null,
        updatedBy: row.updated_by || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

export async function loadQSlotCommitmentSummaries(
    qSlotIds = []
) {
    const cleanQSlotIds = [
        ...new Set(
            (Array.isArray(qSlotIds) ? qSlotIds : [])
                .filter(Boolean)
        ),
    ];

    if (cleanQSlotIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase.rpc(
        "load_q_slot_commitment_summaries",
        {
            target_q_slot_ids: cleanQSlotIds,
        }
    );

    if (error) {
        console.error(
            "Failed to load Q-slot commitment summaries:",
            {
                qSlotIds: cleanQSlotIds,
                error,
            }
        );

        throw error;
    }

    return (data || []).map(
        mapQSlotCommitmentSummaryFromDb
    );
}

export async function loadQSlotCommitments(
    qSlotId
) {
    if (!qSlotId) {
        return [];
    }

    const { data, error } = await supabase.rpc(
        "load_q_slot_commitments",
        {
            target_q_slot_id: qSlotId,
        }
    );

    if (error) {
        console.error(
            "Failed to load Q-slot commitments:",
            {
                qSlotId,
                error,
            }
        );

        throw error;
    }

    return (data || []).map(
        mapQSlotCommitmentFromDb
    );
}

export async function setQSlotCommitment({
    qSlotId,
    memberId,
    commitmentType,
}) {
    if (!qSlotId) {
        throw new Error(
            "Q slot id is required to set a commitment."
        );
    }

    if (!memberId) {
        throw new Error(
            "Member id is required to set a commitment."
        );
    }

    if (
        commitmentType !== null &&
        commitmentType !== "hc" &&
        commitmentType !== "sc"
    ) {
        throw new Error(
            "Commitment type must be hc, sc, or null."
        );
    }

    const { data, error } = await supabase.rpc(
        "set_q_slot_commitment",
        {
            target_q_slot_id: qSlotId,
            target_member_id: memberId,
            target_commitment_type:
                commitmentType,
        }
    );

    if (error) {
        console.error(
            "Failed to set Q-slot commitment:",
            {
                qSlotId,
                memberId,
                commitmentType,
                error,
            }
        );

        throw error;
    }

    const row = Array.isArray(data)
        ? data[0]
        : data;

    if (!row) {
        throw new Error(
            "Q-slot commitment command returned no result."
        );
    }

    return {
        commitmentId:
            row.commitment_id || null,
        qSlotId:
            row.q_slot_id || qSlotId,
        memberId:
            row.member_id || memberId,
        commitmentType:
            row.commitment_type || null,
        source:
            row.source || null,
        createdBy:
            row.created_by || null,
        updatedBy:
            row.updated_by || null,
        createdAt:
            row.created_at || null,
        updatedAt:
            row.updated_at || null,
        cleared:
            Boolean(row.cleared),
    };
}

export async function loadExercises() {
    const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("name", { ascending: true });
    
    if (error) throw error;

    return (data || []).map(mapExerciseFromDb);
}

export async function loadMemberDashboardStats(regionId, memberId) {
    const { data, error } = await supabase
        .from("member_stats")
        .select("*")
        .eq("region_id", regionId)
        .eq("member_id", memberId)
        .maybeSingle();

    if (error) {
        console.warn("Failed to load member_stats:", error);
        return null;
    }

    if (!data) {
        return {
            posts: 0,
            qs: 0,
            fngsEh: 0,
            favoriteAo: null,
            lastPostDate: null,
            firstPostDate: null,
            lastQDate: null,
        };
    }

    return {
        posts: data.total_posts ?? 0,
        qs: data.total_qs ?? 0,
        fngsEh: data.fngs_eh ?? 0,
        favoriteAo: data.favorite_ao ?? null,
        lastPostDate: data.last_post_date ?? null,
        firstPostDate: data.first_post_date ?? null,
        lastQDate: data.last_q_date ?? null,
    };
}

export async function loadMemberSessions(regionId, memberId, mode = "attended") {
    if (!regionId || !memberId) return [];

    const pageSize = 1000;
    let from = 0;
    let allSessions = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select("*")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allSessions = allSessions.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return allSessions
        .map(mapSessionFromDb)
        .filter(session => {
            const effectiveQIds = session.qIds || [];
            const isQ = effectiveQIds.includes(memberId);
            const attended = session.attendeeIds?.includes(memberId);

            if (mode === "q") return isQ;
            if (mode === "attended") return attended;
            return attended || isQ;
        });
}

export async function loadMemberSessionByDate(regionId, memberId, date, mode = "attended") {
    if (!regionId || !memberId || !date) return null;

    const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("region_id", regionId)
        .eq("date", date);

    if (error) throw error;

    const sessions = (data || []).map(mapSessionFromDb);

    return sessions.find(session => {
        const effectiveQIds = session.qIds || [];
        const isQ = effectiveQIds.includes(memberId);
        const attended = session.attendeeIds?.includes(memberId);

        if (mode === "q") return isQ;
        if (mode === "attended") return attended;
        return attended || isQ;
    }) || null;
}

function mapExerciseFromDb(row) {
    return {
        id: row.id,
        name: row.name,
        normalizedName: row.normalized_name,
        description: row.description || "",
        source: row.source,
        createdAt: row.created_at,
    };
}

async function timed(
    label,
    promise,
    timings = null,
    timingKey = null
) {
    const startedAt = performance.now();

    try {
        return await promise;
    } finally {
        const durationMs = Math.round(
            performance.now() - startedAt
        );

        console.log(`${label}: ${durationMs} ms`);

        if (timings && timingKey) {
            timings[timingKey] = durationMs;
        }
    }
}

export async function loadRegionData(
    regionId,
    timings = null
) {
    const [
        regionResult,
        memberResult,
        sessionResult,
        plannedWorkoutResult,
        aoResult,
        siteResult,
        qSlotResult,
        savedPlannerSectionResult,
        announcementResult,
        qSourceResult,
        memberStatsResult,
        aoLeadershipContactResult,
        memberInviterResult,
    ] = await Promise.all([
        timed(
            "loadRegionData:region",
            supabase
                .from("regions")
                .select(`
                    id,
                    name,
                    workout_field_labels,
                    fng_naming_post_number
                `)
                .eq("id", regionId)
                .single(),
            timings,
            "regionMs"
        ),

        timed(
            "loadRegionData:members",
            loadAllMembers(regionId),
            timings,
            "membersMs"
        ),

        timed(
            "loadRegionData:sessions",
            loadRecentSessions(regionId),
            timings,
            "sessionsMs"
        ),

        timed(
            "loadRegionData:plannedWorkouts",
            supabase
                .from("planned_workouts")
                .select("*")
                .eq("region_id", regionId),
            timings,
            "plannedWorkoutsMs"
        ),

        timed(
            "loadRegionData:aos",
            supabase
                .from("aos")
                .select("*")
                .eq("region_id", regionId),
            timings,
            "aosMs"
        ),

        timed(
            "loadRegionData:sites",
            supabase
                .from("sites")
                .select("*")
                .eq("region_id", regionId)
                .order("name", { ascending: true }),
            timings,
            "sitesMs"
        ),

        timed(
            "loadRegionData:qSlots",
            loadAllQSlots(regionId),
            timings,
            "qSlotsMs"
        ),

        timed(
            "loadRegionData:savedPlannerSections",
            supabase
                .from("saved_planner_sections")
                .select("*")
                .eq("region_id", regionId)
                .order("last_used_at", {
                    ascending: false,
                    nullsFirst: false,
                })
                .order("created_at", { ascending: false }),
            timings,
            "savedPlannerSectionsMs"
        ),

        timed(
            "loadRegionData:announcements",
            loadAnnouncements(regionId),
            timings,
            "announcementsMs"
        ),

        timed(
            "loadRegionData:qSources",
            loadQSources(regionId),
            timings,
            "qSourcesMs"
        ),

        timed(
            "loadRegionData:memberStats",
            loadRegionMemberStats(regionId),
            timings,
            "memberStatsMs"
        ),

        timed(
            "loadRegionData:aoLeadershipContacts",
            loadAoLeadershipContacts(regionId),
            timings,
            "aoLeadershipContactsMs"
        ),
        
        timed(
            "loadRegionData:memberInviters",
            loadMemberInvitersForRegion(regionId),
            timings,
            "memberInvitersMs"
        ),
        ]);

    const backblastLinksBySessionId = new Map();

    if (regionResult.error) throw regionResult.error;
    if (sessionResult.error) throw sessionResult.error;
    if (plannedWorkoutResult.error) throw plannedWorkoutResult.error;
    if (aoResult.error) throw aoResult.error;
    if (siteResult.error) throw siteResult.error;
    if (savedPlannerSectionResult.error) throw savedPlannerSectionResult.error;

    const inviterIdsByMemberId = new Map();

    memberInviterResult.forEach(relationship => {
        if (
            !relationship.memberId ||
            !relationship.inviterMemberId
        ) {
            return;
        }

        const existing =
            inviterIdsByMemberId.get(relationship.memberId) || [];

        if (!existing.includes(relationship.inviterMemberId)) {
            existing.push(relationship.inviterMemberId);
        }

        inviterIdsByMemberId.set(
            relationship.memberId,
            existing
        );
    });
    
    return {
        regionName: regionResult.data.name,
        fngNamingPostNumber: regionResult.data.fng_naming_post_number ?? 1,
        members: memberResult.map(row => {
            const member = mapMemberFromDb(row);
        
            /*
             * Keep the legacy scalar first during the transition.
             * Additional relationships follow from member_inviters.
             */
            const inviterIds = [
                ...new Set([
                    member.invitedById,
                    ...(inviterIdsByMemberId.get(member.id) || []),
                ].filter(Boolean)),
            ];
        
            return {
                ...member,
                inviterIds,
                invitedById: inviterIds[0] || null,
            };
        }),
        memberInviters: memberInviterResult,
        sessions: sessionResult.map(row => {
            const session = mapSessionFromDb(row);
            const historicalBackblast = backblastLinksBySessionId.get(session.id);
        
            return {
                ...session,
                hasHistoricalBackblast: Boolean(historicalBackblast),
                historicalBackblastText: "",
                historicalParsedBackblast: null,
                historicalBackblastLink: historicalBackblast || null,
            };
        }),        
        plannedWorkouts: plannedWorkoutResult.data.map(mapPlannedWorkoutFromDb),
        aos: aoResult.data.map(mapAoFromDb),
        sites: (siteResult.data || []).map(mapSiteFromDb),
        qSlots: qSlotResult.map(mapQSlotFromDb),
        savedPlannerSections: (savedPlannerSectionResult.data || [])
            .map(mapSavedPlannerSectionFromDb),
        workoutFieldLabels: regionResult.data.workout_field_labels || {},
        announcements: announcementResult,
        qSources: qSourceResult,
        memberStats: memberStatsResult,
        memberStatsByMemberId: Object.fromEntries(
            memberStatsResult.map(stats => [stats.memberId, stats])
        ),
        aoLeadershipContacts: aoLeadershipContactResult,
    };
}

export async function updateRegionWorkoutFieldLabels(regionId, labels) {
    const { data, error } = await supabase
        .from("regions")
        .update({
            workout_field_labels: labels,
        })
        .eq("id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapRegionFromDb(data);
}

export function mapMemberFromDb(row) {
    const invitedById = row.invited_by_id || null;

    return {
        id: row.id,
        paxName: row.pax_name,
        realName: row.real_name,
        homeAo: row.home_ao,
        invitedById,
        inviterIds: invitedById ? [invitedById] : [],
        firstPostDate: row.first_post_date,
        status: row.status,
    };
}

export function mapSessionFromDb(row) {
    return {
        id: row.id,
        date: row.date,
        aoId: row.ao_id,
        siteId: row.site_id || null,
        aoName: row.ao_name,
        attendeeIds: row.attendee_ids || [],
        qIds: row.q_ids || (row.q_id ? [row.q_id] : []),
        fngs: row.fngs || [],
        notes: row.notes || "",
        workout: row.workout || null,
        announcementText:
            typeof row.announcement_text === "string"
                ? row.announcement_text
                : row.announcement_snapshot?.text ??
                  row.workout?.announcementText ??
                  "",
        announcementSnapshot:
            row.announcement_snapshot || null,
        sourcePlannedWorkoutId: row.source_planned_workout_id,
        sourceQSlotId: row.source_q_slot_id || null,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id || null,
        backblastText:
            row.backblast_text || "",

        backblastHashtagsText:
            row.backblast_hashtags_text ?? null,

        backblastIntroText:
            row.backblast_intro_text ?? null,

        backblastBodyText:
            row.backblast_body_text ?? null,

        backblastStatus:
            row.backblast_status || null,
        backblastPostedAt: row.backblast_posted_at || null,
        unresolvedPax: row.unresolved_pax || [],
        weatherSnapshot: row.weather_snapshot || null,
        startTime: row.start_time || null,
        attendanceReviewStatus:
            row.attendance_review_status || "not_required",
        attendanceReviewNotes:
            row.attendance_review_notes || "",
    };
}

function mapPlannedWorkoutFromDb(row) {
    return {
        id: row.id,
        date: row.date,
        aoId: row.ao_id,
        siteId: row.site_id || null,
        aoName: row.ao_name,
        title: row.title || "",
        introduction: row.introduction || "",
        warmorama: row.warmorama || "",
        thangs: row.thangs || "",
        finisher: row.finisher || "",
        notes: row.notes || "",
        sourceWorkoutId: null,
        sourceSessionId: row.source_session_id,
        sourceQSlotId: row.source_q_slot_id || null,
        createdAt: row.created_at,
        lastModifiedAt: row.last_modified_at,
        createdByUserId: row.created_by_user_id || null,
        isShared: row.is_shared ?? true,
        isFinalized: row.is_finalized ?? false,
        timers: row.timers || [],
        preblastText: row.preblast_text || "",
        preblastLastModifiedAt: row.preblast_last_modified_at || null,
        thangSections: row.thang_sections || null,
        announcementMode:
            row.announcement_mode === "custom"
                ? "custom"
                : "auto",
        announcementText: row.announcement_text || "",
        announcementLegacyText: row.announcement_legacy_text || "",
        thirdFMode:
            row.third_f_mode === "custom"
                ? "custom"
                : "auto",
        thirdFText: row.third_f_text || "",
        thirdFLegacyText:
            row.third_f_legacy_text || "",
            };
}

function getDefaultEmphasisScheduleForAo(aoName) {
    const schedule = {};

    function getDefaultEmphasisScheduleForAo(aoName) {
        const schedule = {};
    
        AO_WORKOUT_EMPHASIS_RULES
            .filter(rule => rule.aoName === aoName)
            .forEach(rule => {
                const key = rule.dayOfWeek === "*" ? "*" : String(rule.dayOfWeek);
    
                schedule[key] = {
                    pattern: rule.pattern || "fixed",
                    values: rule.values || [],
                    startsOnDate: rule.startsOnDate || null,
                    daysOfWeek: rule.daysOfWeek || [],
                };
            });
    
        return schedule;
    }
    return schedule;
}

function hasEmphasisSchedule(schedule) {
    return schedule && Object.keys(schedule).length > 0;
}

function mapAoFromDb(row) {
    const dbSchedule = row.emphasis_schedule || {};

    return {
        id: row.id,
        name: row.name,
        defaultSiteId: row.default_site_id || null,
        locationName: row.location_name,
        daysOfWeek: row.days_of_week || [],
        time: row.time,
        timeSchedule: row.time_schedule || {},
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
        address: row.address || "",
        mapUrl: row.map_url || "",
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        weatherLocationLabel: row.weather_location_label || "",
        weatherEnabled: row.weather_enabled ?? false,
        emphasisSchedule: hasEmphasisSchedule(dbSchedule)
            ? dbSchedule
            : getDefaultEmphasisScheduleForAo(row.name),
    };
}

function mapSiteFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        name: row.name,
        address: row.address || "",
        mapUrl: row.map_url || "",
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        weatherLocationLabel: row.weather_location_label || "",
        weatherEnabled: row.weather_enabled ?? false,
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapQSlotFromDb(row) {
    return {
        id: row.id,
        aoId: row.ao_id,
        siteId: row.site_id || null,
        date: row.date,
        startTime: row.start_time || null,
        durationMinutes: row.duration_minutes ?? null,
        qUserId: row.q_user_id || null,
        createdAt: row.created_at,
        preblastText: row.preblast_text || "",
        preblastLastModifiedAt: row.preblast_last_modified_at || null,
        preblastPostedAt: row.preblast_posted_at || null,
        overrideTime: row.override_time || null,
        overrideEmphasis: row.override_emphasis || null,
        overrideTitle: row.override_title || null,
        customEmphasisLabel: row.custom_emphasis_label || null,
    };
}

function mapAdminFlagFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        type: row.type,
        status: row.status,
        severity: row.severity,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id,
        sessionId: row.session_id,
        proposedPaxName: row.proposed_pax_name,
        matchedMemberIds: row.matched_member_ids || [],
        message: row.message || "",
        resolvedAt: row.resolved_at,
        resolvedByUserId: row.resolved_by_user_id,
        resolutionNotes: row.resolution_notes || "",
    };
}

export async function insertMember(regionId, member) {
    const { data, error } = await supabase
        .from("members")
        .insert([
            {
                id: member.id,
                region_id: regionId,
                pax_name: member.paxName,
                real_name: member.realName || null,
                home_ao: member.homeAo || null,
                invited_by_id:
                    member.inviterIds?.[0] ??
                    member.invitedById ??
                    null,
                first_post_date: member.firstPostDate || null,
                status: member.status,
            },
        ])
        .select()
        .single();
    if (error) throw error;

    return mapMemberFromDb(data);
}

export async function setMemberRosterStatusInCloud(
    memberId,
    isActive
) {
    if (!memberId) {
        throw new Error(
            "Member id is required to update roster status."
        );
    }

    const { data, error } = await supabase.rpc(
        "set_member_roster_status",
        {
            p_member_id: memberId,
            p_is_active: Boolean(isActive),
        }
    );

    if (error) throw error;

    const row = Array.isArray(data)
        ? data[0]
        : data;

    if (!row) {
        throw new Error(
            "Roster status command returned no member."
        );
    }

    return mapMemberFromDb(row);
}

export async function renameMemberInCloud(
    memberId,
    paxName
) {
    if (!memberId) {
        throw new Error(
            "Member id is required to rename a member."
        );
    }

    const normalizedName =
        String(paxName || "")
            .trim()
            .replace(/\s+/g, " ");

    if (!normalizedName) {
        throw new Error(
            "PAX name cannot be empty."
        );
    }

    const { data, error } = await supabase.rpc(
        "rename_member",
        {
            p_member_id: memberId,
            p_pax_name: normalizedName,
        }
    );

    if (error) throw error;

    const row = Array.isArray(data)
        ? data[0]
        : data;

    if (!row) {
        throw new Error(
            "Rename command returned no member."
        );
    }

    return mapMemberFromDb(row);
}

export async function updateMemberInCloud(regionId, member) {
    const { data, error } = await supabase
        .from("members")
        .update({
            region_id: regionId,
            pax_name: member.paxName,
            real_name: member.realName || null,
            home_ao: member.homeAo || null,
            invited_by_id:
                member.inviterIds?.[0] ??
                member.invitedById ??
                null,
            first_post_date: member.firstPostDate || null,
            status: member.status,
        })
        .eq("id", member.id)
        .eq("region_id", regionId)
        .select()
        .single();
    
    if (error) throw error;
    
    return mapMemberFromDb(data);
}

export async function setMemberInviters(
    memberId,
    inviterIds = [],
    {
        source = "app",
        sourceMetadata = {},
        sessionId = null,
    } = {}
) {
    if (!memberId) {
        throw new Error("Member id is required to update inviters.");
    }

    const cleanInviterIds = [
        ...new Set(
            (Array.isArray(inviterIds) ? inviterIds : [])
                .filter(Boolean)
        ),
    ];

    const { data, error } = await supabase.rpc(
        "set_member_inviters",
        {
            p_member_id: memberId,
            p_inviter_member_ids: cleanInviterIds,
            p_source: source,
            p_source_metadata: sourceMetadata,
            p_session_id: sessionId,
        }
    );

    if (error) throw error;

    return (data || []).map(row => ({
        memberId: row.member_id,
        inviterMemberId: row.inviter_member_id,
        source: row.source || "",
        sourceMetadata: row.source_metadata || {},
        createdAt: row.created_at || null,
    }));
}

export async function executeSessionSaveCommand(
    command
) {
    if (!command?.p_region_id) {
        throw new Error("Region id is required");
    }

    if (!command?.p_session?.id) {
        throw new Error("Session id is required");
    }

    if (
        command.p_mode !== "create" &&
        command.p_mode !== "update"
    ) {
        throw new Error(
            `Invalid session save mode: ${command.p_mode}`
        );
    }

    const { data, error } = await supabase.rpc(
        "save_session_command",
        command
    );

    if (error) {
        console.error(
            "executeSessionSaveCommand failed:",
            {
                mode: command.p_mode,
                regionId: command.p_region_id,
                sessionId:
                    command.p_session.id,
                error,
            }
        );

        throw error;
    }

    if (!data?.session) {
        throw new Error(
            "Session command returned no session"
        );
    }

    return {
        session: {
            ...mapSessionFromDb(data.session),

            visitors: (data.visitors || []).map(
                visitor => ({
                    id: visitor.id,
                    sessionId:
                        visitor.session_id,
                    f3Name:
                        visitor.f3_name,
                    homeRegion:
                        visitor.home_region || "",
                    realName:
                        visitor.real_name || "",
                    createdByUserId:
                        visitor.created_by_user_id ||
                        null,
                    createdAt:
                        visitor.created_at || null,
                })
            ),
        },

        fngs: data.fngs || [],
        visitors: data.visitors || [],
    };
}

export async function insertSession(regionId, session) {
    const { data, error } = await supabase
        .from("sessions")
        .insert([
            {
                id: session.id,
                region_id: regionId,
                date: session.date,
                ao_id: session.aoId || null,
                site_id: session.siteId || null,
                ao_name: session.aoName,
                q_ids: session.qIds || [],
                q_id: session.qIds?.[0] || null,
                attendee_ids: session.attendeeIds || [],
                fngs: session.fngs || [],
                notes: session.notes || "",
                workout: session.workout || null,
                announcement_text:
                    typeof session.announcementText === "string"
                        ? session.announcementText
                        : null,
                announcement_snapshot:
                    session.announcementSnapshot || null,
                source_planned_workout_id: session.sourcePlannedWorkoutId || null,
                source_q_slot_id: session.sourceQSlotId || null,
                created_at: session.createdAt,
                created_by_user_id: session.createdByUserId,
                backblast_text:
                    session.backblastText || "",

                backblast_hashtags_text:
                    session.backblastHashtagsText ?? null,

                backblast_intro_text:
                    session.backblastIntroText ?? null,

                backblast_body_text:
                    session.backblastBodyText ?? null,

                backblast_status:
                    session.backblastStatus || null,
                backblast_posted_at: session.backblastPostedAt || null,
                unresolved_pax: session.unresolvedPax || [],
                weather_snapshot: session.weatherSnapshot || null,
                start_time: session.startTime || null,
            },
        ])
        .select()
        .single();
    if (error) throw error;

    const savedSession = mapSessionFromDb(data);

    logAppEvent({
        type: APP_EVENTS.SESSION_LOGGED,
        metadata: {
            sessionId: savedSession.id,
            sessionDate: savedSession.date || null,
            aoName: savedSession.aoName || null,
            paxCount: savedSession.attendeeIds?.length || 0,
            fngCount: savedSession.fngs?.length || 0,
            qCount: savedSession.qIds?.length || 0,
            sourcePlannedWorkoutId: savedSession.sourcePlannedWorkoutId || null,
            sourceQSlotId: savedSession.sourceQSlotId || null,
            hasWorkout: Boolean(savedSession.workout),
        },
    });

    rebuildMemberStatsForMembers(
        regionId,
        getAffectedMemberIdsFromSession(savedSession)
    ).catch(error => {
        console.warn("Failed to rebuild member stats:", error);
    });

    return savedSession;
}

export async function updateSessionInCloud(regionId, session) {
    const oldSession = await getSessionById(session.id).catch(() => null);

    const { data, error } = await supabase
        .from("sessions")
        .update({
            region_id: regionId,
            date: session.date,
            ao_id: session.aoId || null,
            site_id: session.siteId || null,
            ao_name: session.aoName,
            q_ids: session.qIds || [],
            q_id: session.qIds?.[0] || null,
            attendee_ids: session.attendeeIds || [],
            fngs: session.fngs || [],
            notes: session.notes || "",
            workout: session.workout || null,
            announcement_text:
                typeof session.announcementText === "string"
                    ? session.announcementText
                    : null,
            announcement_snapshot:
                session.announcementSnapshot || null,
            source_planned_workout_id: session.sourcePlannedWorkoutId || null,
            source_q_slot_id: session.sourceQSlotId || null,
            created_at: session.createdAt,
            backblast_text:
                session.backblastText || "",

            backblast_hashtags_text:
                session.backblastHashtagsText ?? null,

            backblast_intro_text:
                session.backblastIntroText ?? null,

            backblast_body_text:
                session.backblastBodyText ?? null,

            backblast_status:
                session.backblastStatus || null,
            backblast_posted_at: session.backblastPostedAt || null,
            unresolved_pax: session.unresolvedPax || [],
            weather_snapshot: session.weatherSnapshot || null,
            start_time: session.startTime || null,
            attendance_review_status: session.attendanceReviewStatus || "not_required",
            attendance_review_notes: session.attendanceReviewNotes || null,
        })
        .eq("id", session.id)
        .select()
        .single();

    if (error) throw error;

const savedSession = mapSessionFromDb(data);

rebuildMemberStatsForMembers(regionId, [
    ...getAffectedMemberIdsFromSession(oldSession),
    ...getAffectedMemberIdsFromSession(savedSession),
]).catch(error => {
    console.warn("Failed to rebuild member stats:", error);
});

return savedSession;
}

export async function insertPlannedWorkout(regionId, workout) {
    const { data, error } = await supabase
        .from("planned_workouts")
        .insert([
            {
                id: workout.id,
                region_id: regionId,
                date: workout.date,
                ao_id: workout.aoId || null,
                site_id: workout.siteId || null,
                ao_name: workout.aoName,
                title: workout.title || "",
                introduction: workout.introduction || "",
                warmorama: workout.warmorama || "",
                thangs: workout.thangs || "",
                finisher: workout.finisher || "",
                notes: workout.notes || "",
                source_session_id: workout.sourceSessionId || null,
                source_q_slot_id: workout.sourceQSlotId || null,
                created_at: workout.createdAt,
                last_modified_at: workout.lastModifiedAt || null,
                created_by_user_id: workout.createdByUserId || null,
                is_shared: workout.isShared ?? false,
                is_finalized: workout.isFinalized ?? false,
                timers: workout.timers || [],
                preblast_text: workout.preblastText || null,
                preblast_last_modified_at: workout.preblastLastModifiedAt || null,
                thang_sections: workout.thangSections || null,
                announcement_mode:
                    workout.announcementMode === "custom"
                        ? "custom"
                        : "auto",
                announcement_text:
                    workout.announcementMode === "custom"
                        ? workout.announcementText || ""
                        : null,
                third_f_mode:
                    workout.thirdFMode === "custom"
                        ? "custom"
                        : "auto",
                third_f_text:
                    workout.thirdFMode === "custom"
                        ? workout.thirdFText || ""
                        : null,
                third_f_legacy_text:
                    workout.thirdFLegacyText || null,
            },
        ])
        .select()
        .single();

    if (error) throw error;

    const savedWorkout = mapPlannedWorkoutFromDb(data);

    logAppEvent({
        type: APP_EVENTS.PLANNED_WORKOUT_CREATED,
        metadata: {
            plannedWorkoutId: savedWorkout.id,
            workoutDate: savedWorkout.date || null,
            aoName: savedWorkout.aoName || null,
            title: savedWorkout.title || null,
            isShared: Boolean(savedWorkout.isShared),
            timerCount: savedWorkout.timers?.length || 0,
            sourceWorkoutId: savedWorkout.sourceWorkoutId || null,
            sourceSessionId: savedWorkout.sourceSessionId || null,
        },
    });

    return savedWorkout;
}

export async function updatePlannedWorkoutInCloud(regionId, workout) {
    const { data, error } = await supabase
        .from("planned_workouts")
        .update({
            region_id: regionId,
            date: workout.date,
            ao_id: workout.aoId || null,
            site_id: workout.siteId || null,
            ao_name: workout.aoName,
            title: workout.title || "",
            introduction: workout.introduction || "",
            warmorama: workout.warmorama || "",
            thangs: workout.thangs || "",
            finisher: workout.finisher || "",
            notes: workout.notes || "",
            source_session_id: workout.sourceSessionId || null,
            source_q_slot_id: workout.sourceQSlotId || null,
            created_at: workout.createdAt,
            last_modified_at: workout.lastModifiedAt || null,
            created_by_user_id: workout.createdByUserId || null,
            is_shared: workout.isShared ?? false,
            is_finalized: workout.isFinalized ?? false,
            timers: workout.timers || [],
            preblast_text: workout.preblastText || null,
            preblast_last_modified_at: workout.preblastLastModifiedAt || null,
            thang_sections: workout.thangSections || null,
            announcement_mode:
                workout.announcementMode === "custom"
                    ? "custom"
                    : "auto",
            announcement_text:
                workout.announcementMode === "custom"
                    ? workout.announcementText || ""
                    : null,
            third_f_mode:
                workout.thirdFMode === "custom"
                    ? "custom"
                    : "auto",
            third_f_text:
                workout.thirdFMode === "custom"
                    ? workout.thirdFText || ""
                    : null,
            third_f_legacy_text:
                workout.thirdFLegacyText || null,
        })
        .eq("id", workout.id)
        .select()
        .single();

    if (error) throw error;

    const updatedWorkout = mapPlannedWorkoutFromDb(data);

    logAppEvent({
        type: APP_EVENTS.PLANNED_WORKOUT_UPDATED,
        metadata: {
            plannedWorkoutId: updatedWorkout.id,
            workoutDate: updatedWorkout.date || null,
            aoName: updatedWorkout.aoName || null,
            title: updatedWorkout.title || null,
            isShared: Boolean(updatedWorkout.isShared),
            timerCount: updatedWorkout.timers?.length || 0,
            sourceWorkoutId: updatedWorkout.sourceWorkoutId || null,
            sourceSessionId: updatedWorkout.sourceSessionId || null,
        },
    });

    return updatedWorkout;
}

export async function insertSessionsBatch(regionId, sessions) {
    const payload = sessions.map(session => {
        const cleanQIds = Array.isArray(session.qIds)
            ? session.qIds.filter(Boolean)
            : [];

        return {
            id: session.id,
            region_id: regionId,
            date: session.date,
            ao_id: session.aoId || null,
            ao_name: session.aoName,
            q_ids: cleanQIds,
            q_id: cleanQIds[0] || null,
            attendee_ids: session.attendeeIds || [],
            fngs: session.fngs || [],
            notes: session.notes || "",
            workout: session.workout || null,
            source_planned_workout_id: session.sourcePlannedWorkoutId || null,
            source_q_slot_id: session.sourceQSlotId || null,
            created_at: session.createdAt,
            unresolved_pax: session.unresolvedPax || [],
        };
    });

    const idCounts = new Map();
    for (const row of payload) {
        idCounts.set(row.id, (idCounts.get(row.id) || 0) + 1);
    }

    const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1);

    console.log("Payload size:", payload.length);
    console.log("Duplicate ID count:", duplicateIds.length);
    console.log("First few duplicate IDs:", duplicateIds.slice(0, 10));

    const { data, error } = await supabase
        .from("sessions")
        .insert(payload)
        .select();

    if (error) throw error;

    await rebuildMemberStatsForRegion(regionId);

    return data;
}

export async function deleteSessionsByAo(regionId, aoName) {
    const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("region_id", regionId)
        .eq("ao_name", aoName);

    if (error) throw error;
}

export async function deleteSessionsInDateRangeForRegion(regionId, startDate, endDate) {
    const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("region_id", regionId)
        .gte("date", startDate)
        .lte("date", endDate);

    if (error) throw error;
}

export async function deleteSessionFromCloud(regionId, sessionId) {
    const oldSession = await getSessionById(sessionId).catch(() => null);

    const { data, error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId)
        .eq("region_id", regionId)
        .select("id");

    if (error) throw error;

    if (!data || data.length === 0) {
        throw new Error("Session delete failed: no matching session was deleted.");
    }

    rebuildMemberStatsForMembers(
        regionId,
        getAffectedMemberIdsFromSession(oldSession)
    ).catch(error => {
        console.warn("Failed to rebuild member stats:", error);
    });
}

export async function deletePlannedWorkoutFromCloud(regionId, workoutId) {
    const { error } = await supabase
        .from("planned_workouts")
        .delete()
        .eq("id", workoutId)
        .eq("region_id", regionId)

    if (error) throw error;
}

export async function insertSite(regionId, site) {
    if (!regionId) {
        throw new Error(
            "Region id is required to create a Site."
        );
    }

    const { data, error } = await supabase.rpc(
        "save_site_command",
        {
            p_action: "create",
            p_region_id: regionId,
            p_site_id: site.id,
            p_name: site.name,
            p_address: site.address || null,
            p_map_url: site.mapUrl || null,
            p_latitude: site.latitude ?? null,
            p_longitude: site.longitude ?? null,
            p_weather_location_label:
                site.weatherLocationLabel || null,
            p_weather_enabled:
                site.weatherEnabled ?? true,
            p_is_active:
                site.isActive ?? true,
        }
    );

    if (error) {
        console.error(
            "Failed to create Site:",
            {
                regionId,
                siteId: site.id,
                error,
            }
        );

        throw error;
    }

    if (!data?.site) {
        throw new Error(
            "Site command returned no Site."
        );
    }

    return mapSiteFromDb(data.site);
}

export async function updateSiteInCloud(
    regionId,
    site
) {
    if (!regionId) {
        throw new Error(
            "Region id is required to update a Site."
        );
    }

    if (!site?.id) {
        throw new Error(
            "Site id is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "save_site_command",
        {
            p_action: "update",
            p_region_id: regionId,
            p_site_id: site.id,
            p_name: site.name,
            p_address: site.address || null,
            p_map_url: site.mapUrl || null,
            p_latitude: site.latitude ?? null,
            p_longitude: site.longitude ?? null,
            p_weather_location_label:
                site.weatherLocationLabel || null,
            p_weather_enabled:
                site.weatherEnabled ?? true,
            p_is_active:
                site.isActive ?? true,
        }
    );

    if (error) {
        console.error(
            "Failed to update Site:",
            {
                regionId,
                siteId: site.id,
                error,
            }
        );

        throw error;
    }

    if (!data?.site) {
        throw new Error(
            "Site command returned no Site."
        );
    }

    return mapSiteFromDb(data.site);
}

export async function insertAo(regionId, ao) {
    const { data, error } = await supabase
        .from("aos")
        .insert([
            {
                id: ao.id,
                region_id: regionId,
                name: ao.name,
                default_site_id: ao.defaultSiteId || null,
                location_name: ao.locationName || null,
                days_of_week: ao.daysOfWeek || [],
                time: ao.time,
                time_schedule: ao.timeSchedule || {},
                is_active: ao.isActive ?? true,
                created_at: ao.createdAt,
                address: ao.address || null,
                map_url: ao.mapUrl || null,
                latitude: ao.latitude ?? null,
                longitude: ao.longitude ?? null,
                weather_location_label: ao.weatherLocationLabel || null,
                weather_enabled: ao.weatherEnabled ?? false,
                emphasis_schedule: ao.emphasisSchedule || {},
            },
        ])
        .select()
        .single();

    if (error) throw error;

    return mapAoFromDb(data);
}

export async function updateAoInCloud(regionId, ao) {
    const { data, error } = await supabase
        .from("aos")
        .update({
            region_id: regionId,
            name: ao.name,
            default_site_id: ao.defaultSiteId || null,
            location_name: ao.locationName || "",
            days_of_week: ao.daysOfWeek || [],
            time: ao.time,
            time_schedule: ao.timeSchedule || {},
            is_active: ao.isActive ?? true,
            created_at: ao.createdAt,
            address: ao.address || null,
            map_url: ao.mapUrl || null,
            latitude: ao.latitude ?? null,
            longitude: ao.longitude ?? null,
            weather_location_label: ao.weatherLocationLabel || null,
            weather_enabled: ao.weatherEnabled ?? false,
            emphasis_schedule: ao.emphasisSchedule || {},
        })
        .eq("id", ao.id)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapAoFromDb(data);
}

export async function deleteAoFromCloud(regionId, aoId) {
    const { error } = await supabase
        .from("aos")
        .delete()
        .eq("id", aoId)
        .eq("region_id", regionId);

    if (error) throw error;
}

export async function insertQSlot(regionId, qSlot) {
    const { data, error } = await supabase
        .from("q_slots")
        .insert([
            {
                id: qSlot.id,
                region_id: regionId,
                ao_id: qSlot.aoId,
                site_id: qSlot.siteId || null,
                start_time: qSlot.startTime || null,
                duration_minutes: qSlot.durationMinutes ?? null,
                date: qSlot.date,
                q_user_id: qSlot.qUserId || null,
                created_at: qSlot.createdAt,
                override_time: qSlot.overrideTime || null,
                override_emphasis: qSlot.overrideEmphasis || null,
                override_title: qSlot.overrideTitle || null,
                custom_emphasis_label: qSlot.customEmphasisLabel || null,
            },
        ])
        .select()
        .single();

    if (error) throw error;

    return mapQSlotFromDb(data);
}

export async function updateQSlotInCloud(regionId, qSlot) {
    const { data, error } = await supabase
        .from("q_slots")
        .update({
            region_id: regionId,
            ao_id: qSlot.aoId,
            site_id: qSlot.siteId || null,
            start_time: qSlot.startTime || null,
            duration_minutes: qSlot.durationMinutes ?? null,
            date: qSlot.date,
            q_user_id: qSlot.qUserId || null,
            created_at: qSlot.createdAt,
            preblast_text: qSlot.preblastText || null,
            preblast_last_modified_at: qSlot.preblastLastModifiedAt || null,
            preblast_posted_at: qSlot.preblastPostedAt || null,
            override_time: qSlot.overrideTime || null,
            override_emphasis: qSlot.overrideEmphasis || null,
            override_title: qSlot.overrideTitle || null,
            custom_emphasis_label: qSlot.customEmphasisLabel || null,
        })
        .eq("id", qSlot.id)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapQSlotFromDb(data);
}

export async function deleteQSlotFromCloud(regionId, qSlotId) {
    const { error } = await supabase
        .from("q_slots")
        .delete()
        .eq("id", qSlotId)
        .eq("region_id", regionId);

    if (error) throw error;
}

export async function deleteUpcomingQSlotsForAo(regionId, aoId, today) {
    const { error } = await supabase
        .from("q_slots")
        .delete()
        .eq("region_id", regionId)
        .eq("ao_id", aoId)
        .gte("date", today);

    if (error) throw error;
}

export async function deleteQSlotsByIds(regionId, qSlotIds) {
    if (!qSlotIds.length) return;

    const { error } = await supabase
        .from("q_slots")
        .delete()
        .eq("region_id", regionId)
        .in("id", qSlotIds);

    if (error) throw error;
}

export async function loadAllRegions() {
    const { data, error } = await supabase.rpc("load_public_regions");

    if (error) throw error;

    return (data || []).map(mapRegionFromDb);
}

export async function loadClaimedMemberIds(regionId) {
    const { data, error } = await supabase.rpc("load_claimed_member_ids", {
        p_region_id: regionId,
    });

    if (error) throw error;

    return new Set((data || [])
        .map(row => row.member_id)
        .filter(Boolean)
    );
}

export async function getRegionById(regionId) {
    const { data, error } = await supabase
        .from("regions")
        .select(`
            id,
            name,
            workout_field_labels,
            fng_naming_post_number
        `)
        .eq("id", regionId)
        .single()

    if (error) throw error;
    return mapRegionFromDb(data);
}

export async function checkRegionAccess(userId, regionId) {
    const { data, error } = await supabase
        .from("region_access")
        .select("*")
        .eq("user_id", userId)
        .eq("region_id", regionId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function loadAccessibleRegions(userId) {
    const { data, error } = await supabase
        .from("region_access")
        .select(`
            region_id,
            regions (
                id,
                name,
                workout_field_labels,
                fng_naming_post_number
            )
        `)
        .eq("user_id", userId); 

    if (error) throw error;

    return (data || [])
        .map(row => row.regions)
        .filter(Boolean)
        .map(mapRegionFromDb);
}

export async function getNotificationSettings(userId) {
    const { data, error } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function upsertNotificationSettings(userId, settings) {
    const { data, error } = await supabase
        .from("notification_settings")
        .upsert(
            {
                user_id: userId,
                push_enabled: settings.push_enabled,
                timezone: settings.timezone,
            },
            { onConflict: "user_id" }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function upsertPushSubscription(
    userId,
    subscription
) {
    if (!subscription?.endpoint) {
        throw new Error("Push subscription endpoint is required.");
    }

    const { data, error } = await supabase
        .from("push_subscriptions")
        .upsert(
            {
                user_id: userId,
                endpoint: subscription.endpoint,
                subscription,
                last_seen_at: new Date().toISOString(),
            },
            {
                onConflict: "endpoint",
            }
        )
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function deletePushSubscription(
    endpoint
) {
    if (!endpoint) return;

    const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);

    if (error) throw error;
}

export async function touchPushSubscription(
    endpoint
) {
    if (!endpoint) return;

    const { error } = await supabase
        .from("push_subscriptions")
        .update({
            last_seen_at: new Date().toISOString(),
        })
        .eq("endpoint", endpoint);

    if (error) throw error;
}

export async function updateCustomTemplates(userId, customTemplates) {
    const { data, error } = await supabase
        .from("profiles")
        .update({
            custom_templates: customTemplates,
        })
        .eq("id", userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function loadAdminFlags(
    regionId,
    {
        status = "open",
        limit = 100,
    } = {}
) {
    if (!regionId) return [];

    const safeLimit = Math.min(
        Math.max(Number(limit) || 100, 1),
        250
    );

    let query = supabase
        .from("admin_flags")
        .select(`
            id,
            region_id,
            type,
            status,
            severity,
            created_at,
            created_by_user_id,
            session_id,
            proposed_pax_name,
            matched_member_ids,
            message,
            resolved_at,
            resolved_by_user_id,
            resolution_notes
        `)
        .eq("region_id", regionId)
        .order("created_at", { ascending: false })
        .limit(safeLimit);

    if (status) {
        query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(mapAdminFlagFromDb);
}

export async function insertAdminFlags(regionId, flags) {
    const rows = flags.map(flag => ({
        id: flag.id,
        region_id: regionId,
        type: flag.type,
        status: flag.status,
        severity: flag.severity,
        created_at: flag.createdAt,
        created_by_user_id: flag.createdByUserId || null,
        session_id: flag.sessionId || null,
        proposed_pax_name: flag.proposedPaxName || null,
        matched_member_ids: flag.matchedMemberIds || [],
        message: flag.message || "",
        resolved_at: flag.resolvedAt || null,
        resolved_by_user_id: flag.resolvedByUserId || null,
        resolution_notes: flag.resolutionNotes || null,
    }));

    const { data, error } = await supabase
        .from("admin_flags")
        .insert(rows)
        .select()

    if (error) throw error;

    return (data || []).map(mapAdminFlagFromDb);
}

export async function updateAdminFlagInCloud(regionId, flag) {
    const { data, error } = await supabase
        .from("admin_flags")
        .update({
            status: flag.status,
            severity: flag.severity,
            resolved_at: flag.resolvedAt || null,
            resolved_by_user_id: flag.resolvedByUserId || null,
            resolution_notes: flag.resolutionNotes || null,
        })
        .eq("id", flag.id)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapAdminFlagFromDb(data);
}

function mapSavedPlannerSectionFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        sectionType: row.section_type,
        name: row.name,
        content: row.content,
        tags: row.tags || [],
        isShared: row.is_shared ?? false,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
    };
}

export async function insertSavedPlannerSection(regionId, section) {
    const { data, error } = await supabase
        .from("saved_planner_sections")
        .insert([
            {
                id: section.id,
                region_id: regionId,
                section_type: section.sectionType,
                name: section.name,
                content: section.content,
                tags: section.tags || [],
                is_shared: section.isShared ?? false,
                created_by_user_id: section.createdByUserId,
                created_at: section.createdAt,
                last_used_at: section.lastUsedAt || null,
            },
        ])
        .select()
        .single();

    if (error) throw error;

    return mapSavedPlannerSectionFromDb(data);
}

export async function updateSavedPlannerSectionInCloud(regionId, section) {
    const { data, error } = await supabase
        .from("saved_planner_sections")
        .update({
            region_id: regionId,
            section_type: section.sectionType,
            name: section.name,
            content: section.content,
            tags: section.tags || [],
            is_shared: section.isShared ?? false,
            created_by_user_id: section.createdByUserId,
            created_at: section.createdAt,
            last_used_at: section.lastUsedAt || null,
        })
        .eq("id", section.id)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapSavedPlannerSectionFromDb(data);
}

export async function deleteSavedPlannerSectionFromCloud(regionId, sectionId) {
    const { error } = await supabase
        .from("saved_planner_sections")
        .delete()
        .eq("id", sectionId)
        .eq("region_id", regionId);

    if (error) throw error;
}

function mapRegionFromDb(row) {
    return {
        id: row.id,
        name: row.name,
        workoutFieldLabels: row.workout_field_labels || null,
        fngNamingPostNumber: row.fng_naming_post_number ?? 1,
        includeInReporting: row.include_in_reporting ?? true,
    };
}

export async function insertImportRun(regionId, importRun) {
    const { data, error } = await supabase
        .from("import_runs")
        .insert({
            region_id: regionId,
            type: importRun.type,
            mode: importRun.mode,
            status: importRun.status,
            summary: importRun.summary || {},
            error: importRun.error || null,
        })
        .select()
        .single();

    if (error) throw error;

    return data;
}

function mapImportRunFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        type: row.type,
        mode: row.mode,
        status: row.status,
        summary: row.summary || {},
        error: row.error || null,
        createdAt: row.created_at,
    };
}

export async function loadImportRuns(regionId, limit = 10) {
    const { data, error } = await supabase
        .from("import_runs")
        .select("*")
        .eq("region_id", regionId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (data || []).map(mapImportRunFromDb);
}

export async function runAggielandImport({ apply = false } = {}) {
    const functionUrl = `${process.env.SUPABASE_URL}/functions/v1/nightly-aggieland-import`;

    const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ apply }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(result?.error || `Import failed with status ${response.status}`);
    }

    return result;
}

export function runAggielandImportDryRun() {
    return runAggielandImport({ apply: false });
}

export function applyAggielandImport() {
    return runAggielandImport({ apply: true });
}

export async function getBackblastLinkBySessionId(sessionId) {
    const { data, error } = await supabase
        .from("session_backblast_links")
        .select("*")
        .eq("session_id", sessionId)
        .order("confidence_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) throw error;

    return data?.[0] || null;
}

export async function loadBackblastLinks(regionId) {
    const { data, error } = await supabase
        .from("session_backblast_links")
        .select(`
            id,
            session_id,
            band_post_key,
            link_method,
            confidence_score,
            created_at,
            sessions!inner(region_id)
        `)
        .eq("sessions.region_id", regionId)
        .order("confidence_score", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
}

export async function searchHistoricalBackblasts(searchTerm) {
    const trimmed = String(searchTerm || "").trim();

    if (trimmed.length < 2) return [];

    const { data, error } = await supabase
        .from("session_backblast_links")
        .select("session_id")
        .ilike("cleaned_content", `%${trimmed}%`)
        .limit(100);

    if (error) throw error;

    return [...new Set(
        (data || [])
            .map(row => row.session_id)
            .filter(Boolean)
    )];
}

export async function loadMappedQSlots(regionId) {
    const rows = await loadAllQSlots(regionId);
    return rows.map(mapQSlotFromDb);
}

export function subscribeToQSlotChanges(regionId, onChange) {
    if (!regionId) return null;

    const channelKey = `q-slots-${regionId}`;

    return subscribeToManagedChannel(channelKey, () =>
        supabase
            .channel(channelKey)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "q_slots",
                    filter: `region_id=eq.${regionId}`,
                },
                onChange
            )
            .subscribe()
    );
}

export function unsubscribeFromChannel(channelOrKey) {
    if (!channelOrKey) return;

    if (typeof channelOrKey === "string") {
        unsubscribeManagedChannel(channelOrKey);
        return;
    }

    supabase.removeChannel(channelOrKey);
}

export function getAffectedMemberIdsFromSession(
    session
) {
    const ids = new Set();

    (session?.attendeeIds || []).forEach(id => {
        if (id) ids.add(id);
    });

    (session?.qIds || []).forEach(id => {
        if (id) ids.add(id);
    });

    (session?.fngs || []).forEach(fng => {
        const fngMemberId =
            fng?.memberId ||
            fng?.member_id ||
            null;

        if (fngMemberId) {
            ids.add(fngMemberId);
        }

        const inviterIds = [
            ...(fng?.inviterIds || []),
            fng?.invitedById,
            fng?.invited_by_id,
        ].filter(Boolean);

        inviterIds.forEach(id => ids.add(id));
    });

    return [...ids];
}

export async function rebuildMemberStatsForMembers(
    regionId,
    memberIds = []
) {
    const uniqueIds = [
        ...new Set(memberIds),
    ].filter(Boolean);

    if (!regionId || uniqueIds.length === 0) {
        return {
            attemptedCount: 0,
            succeededCount: 0,
            failedCount: 0,
            succeeded: true,
        };
    }

    const results = await Promise.allSettled(
        uniqueIds.map(memberId =>
            supabase.rpc(
                "rebuild_member_stats_for_member",
                {
                    target_region_id: regionId,
                    target_member_id: memberId,
                }
            )
        )
    );

    const failed = results.filter(
        result =>
            result.status === "rejected" ||
            result.value?.error
    );

    if (failed.length > 0) {
        console.warn(
            "Some member stats rebuilds failed:",
            failed
        );
    }

    return {
        attemptedCount: uniqueIds.length,
        succeededCount:
            uniqueIds.length - failed.length,
        failedCount: failed.length,
        succeeded: failed.length === 0,
    };
}

export async function rebuildMemberStatsForRegion(regionId) {
    if (!regionId) return;

    const { error } = await supabase.rpc("rebuild_member_stats_for_region", {
        target_region_id: regionId,
    });

    if (error) {
        console.warn("Failed to rebuild member stats:", error);
    }
}

export async function loadRecentMemberActivity(regionId, memberId, limit = 2) {
    if (!regionId || !memberId) return [];

    const { data, error } = await supabase
        .from("sessions")
        .select(`
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
            source_planned_workout_id,
            source_q_slot_id,
            created_at
        `)
        .eq("region_id", regionId)
        .or(`attendee_ids.cs.["${memberId}"],q_ids.cs.{${memberId}},q_id.eq.${memberId}`)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.warn("Failed to load recent member activity:", error);
        return [];
    }

    return (data || []).map(mapSessionFromDb);
}

export async function loadAnnouncements(regionId) {
    const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("region_id", regionId)
        .eq("is_active", true)
        .order("display_order", {
            ascending: true,
            nullsFirst: false,
        })
        .order("created_at", {
            ascending: false,
        });

    if (error) throw error;

    return resolveActiveAnnouncements(
        (data || []).map(mapAnnouncementFromDb),
        {
            regionId,
            targetDate: getTodayDate(),
            aoId: null,
        }
    );
}

export async function loadAllAnnouncements(regionId) {
    console.log("loadAllAnnouncements regionId", regionId);

    const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("region_id", regionId)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

    console.log("loadAllAnnouncements result", { data, error });

    if (error) throw error;

    return (data || []).map(mapAnnouncementFromDb);
}

export async function insertAnnouncement(
    regionId,
    announcement
) {
    if (!regionId) {
        throw new Error(
            "Region id is required to create an announcement."
        );
    }

    if (!announcement?.id) {
        throw new Error(
            "Announcement id is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "save_announcement_command",
        {
            p_action: "create",
            p_region_id: regionId,
            p_announcement_id: announcement.id,
            p_title: announcement.title || "",
            p_body: announcement.body || "",
            p_scope: "region",
            p_ao_id: null,
            p_starts_on:
                announcement.startsOn || null,
            p_ends_on:
                announcement.endsOn || null,
            p_is_active:
                announcement.isActive ?? true,
            p_include_in_backblast:
                announcement.includeInBackblast ??
                false,
            p_link_url:
                announcement.linkUrl || null,
            p_link_label:
                announcement.linkLabel || null,
            p_reorder_items: null,
            p_update_fields: null,
        }
    );

    if (error) {
        console.error(
            "Failed to create announcement:",
            {
                regionId,
                announcementId: announcement.id,
                error,
            }
        );

        throw error;
    }

    if (!data?.announcement) {
        throw new Error(
            "Announcement command returned no announcement."
        );
    }

    return mapAnnouncementFromDb(
        data.announcement
    );
}

export async function updateAnnouncementInCloud(
    regionId,
    announcement
) {
    if (!regionId) {
        throw new Error(
            "Region id is required to update an announcement."
        );
    }

    if (!announcement?.id) {
        throw new Error(
            "Announcement id is required."
        );
    }

    const updateFields = [
        "title",
        "body",
        "starts_on",
        "ends_on",
        "is_active",
        "include_in_backblast",
        "link_url",
        "link_label",
    ];

    const { data, error } = await supabase.rpc(
        "save_announcement_command",
        {
            p_action: "update",
            p_region_id: regionId,
            p_announcement_id: announcement.id,
            p_title: announcement.title || "",
            p_body: announcement.body || "",
            p_scope: "region",
            p_ao_id: null,
            p_starts_on:
                announcement.startsOn || null,
            p_ends_on:
                announcement.endsOn || null,
            p_is_active:
                announcement.isActive ?? true,
            p_include_in_backblast:
                announcement.includeInBackblast ??
                false,
            p_link_url:
                announcement.linkUrl || null,
            p_link_label:
                announcement.linkLabel || null,
            p_reorder_items: null,
            p_update_fields: updateFields,
        }
    );

    if (error) {
        console.error(
            "Failed to update announcement:",
            {
                regionId,
                announcementId: announcement.id,
                error,
            }
        );

        throw error;
    }

    if (!data?.announcement) {
        throw new Error(
            "Announcement command returned no announcement."
        );
    }

    return mapAnnouncementFromDb(
        data.announcement
    );
}

export async function setAnnouncementActiveInCloud(
    regionId,
    announcementId,
    isActive
) {
    if (!regionId) {
        throw new Error(
            "Region id is required to change announcement status."
        );
    }

    if (!announcementId) {
        throw new Error(
            "Announcement id is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "save_announcement_command",
        {
            p_action: "update",
            p_region_id: regionId,
            p_announcement_id: announcementId,
            p_title: null,
            p_body: null,
            p_scope: null,
            p_ao_id: null,
            p_starts_on: null,
            p_ends_on: null,
            p_is_active: Boolean(isActive),
            p_include_in_backblast: null,
            p_link_url: null,
            p_link_label: null,
            p_reorder_items: null,
            p_update_fields: ["is_active"],
        }
    );

    if (error) {
        console.error(
            "Failed to change announcement status:",
            {
                regionId,
                announcementId,
                isActive,
                error,
            }
        );

        throw error;
    }

    if (!data?.announcement) {
        throw new Error(
            "Announcement command returned no announcement."
        );
    }

    return mapAnnouncementFromDb(
        data.announcement
    );
}

export async function deleteAnnouncementFromCloud(
    regionId,
    announcementId
) {
    if (!regionId) {
        throw new Error(
            "Region id is required to delete an announcement."
        );
    }

    if (!announcementId) {
        throw new Error(
            "Announcement id is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "save_announcement_command",
        {
            p_action: "delete",
            p_region_id: regionId,
            p_announcement_id: announcementId,
            p_title: null,
            p_body: null,
            p_scope: null,
            p_ao_id: null,
            p_starts_on: null,
            p_ends_on: null,
            p_is_active: null,
            p_include_in_backblast: null,
            p_link_url: null,
            p_link_label: null,
            p_reorder_items: null,
            p_update_fields: null,
        }
    );

    if (error) {
        console.error(
            "Failed to delete announcement:",
            {
                regionId,
                announcementId,
                error,
            }
        );

        throw error;
    }

    if (data?.deletedId !== announcementId) {
        throw new Error(
            "Announcement command did not confirm the delete."
        );
    }

    return announcementId;
}

export async function reorderAnnouncementsInCloud(
    regionId,
    announcements
) {
    if (!regionId) {
        throw new Error(
            "Region id is required to reorder announcements."
        );
    }

    if (
        !Array.isArray(announcements) ||
        announcements.length === 0
    ) {
        throw new Error(
            "At least one announcement is required to reorder."
        );
    }

    const reorderItems = announcements.map(
        (announcement, index) => {
            const announcementId =
                typeof announcement === "string"
                    ? announcement
                    : announcement?.id;

            const displayOrder =
                typeof announcement === "object" &&
                Number.isInteger(
                    announcement?.displayOrder
                )
                    ? announcement.displayOrder
                    : index;

            if (!announcementId) {
                throw new Error(
                    "Every reordered announcement must have an id."
                );
            }

            return {
                id: announcementId,
                displayOrder,
            };
        }
    );

    const { data, error } = await supabase.rpc(
        "save_announcement_command",
        {
            p_action: "reorder",
            p_region_id: regionId,
            p_announcement_id: null,
            p_title: null,
            p_body: null,
            p_scope: null,
            p_ao_id: null,
            p_starts_on: null,
            p_ends_on: null,
            p_is_active: null,
            p_include_in_backblast: null,
            p_link_url: null,
            p_link_label: null,
            p_reorder_items: reorderItems,
            p_update_fields: null,
        }
    );

    if (error) {
        console.error(
            "Failed to reorder announcements:",
            {
                regionId,
                reorderItems,
                error,
            }
        );

        throw error;
    }

    if (!Array.isArray(data?.announcements)) {
        throw new Error(
            "Announcement reorder command returned no announcements."
        );
    }

    return data.announcements.map(
        mapAnnouncementFromDb
    );
}

function mapAnnouncementFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        scope: row.scope,
        aoId: row.ao_id,
        title: row.title,
        body: row.body,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        isActive: row.is_active,
        createdByUserId:
            row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        includeInBackblast:
            row.include_in_backblast ?? false,
        displayOrder:
            row.display_order ?? 999,
        linkUrl: row.link_url || "",
        linkLabel: row.link_label || "",
    };
}

export async function loadRegionMemberStats(regionId) {
    if (!regionId) return [];

    const pageSize = 1000;
    let from = 0;
    let allStats = [];

    while (true) {
        const { data, error } = await supabase
            .from("member_stats")
            .select("*")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) {
            console.warn("Failed to load member_stats:", error);
            return [];
        }

        if (!data || data.length === 0) break;

        allStats = allStats.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return allStats.map(mapMemberStatsFromDb);
}

function mapMemberStatsFromDb(row) {
    return {
        memberId: row.member_id,
        regionId: row.region_id,

        posts: row.total_posts ?? 0,
        qs: row.total_qs ?? 0,

        posts30Days: row.posts_30_days ?? 0,
        qs30Days: row.qs_30_days ?? 0,
        posts90Days: row.posts_90_days ?? 0,
        qs90Days: row.qs_90_days ?? 0,

        fngsEh: row.fngs_eh ?? 0,
        favoriteAo: row.favorite_ao ?? null,

        lastPostDate: row.last_post_date ?? null,
        firstPostDate: row.first_post_date ?? null,
        lastQDate: row.last_q_date ?? null,
    };
}

export async function loadAoInsightMonths({
    regionId,
    aoId,
}) {
    const { data, error } = await supabase.rpc(
        "get_ao_insight_months",
        {
            p_region_id: regionId,
            p_ao_id: aoId,
        }
    );

    if (error) throw error;

    return (data || []).map(row => row.month_key);
}

export async function loadAoInsightSessions({
    regionId,
    aoId,
    startDate,
    endDate,
}) {
    const { data, error } = await supabase.rpc(
        "get_ao_insight_sessions",
        {
            p_region_id: regionId,
            p_ao_id: aoId,
            p_start_date: startDate,
            p_end_date: endDate,
        }
    );

    if (error) throw error;

    const sessions = (data || []).map(mapSessionFromDb);

    const visitorsBySessionId = await loadVisitorsForSessions(
        sessions.map(session => session.id)
    );

    return sessions.map(session => ({
        ...session,
        visitors: visitorsBySessionId.get(session.id) || [],
    }));
}

export async function loadRegionInsightSessions({
    regionId,
    startDate,
    endDate,
}) {
    const pageSize = 1000;
    let from = 0;
    const rows = [];

    while (true) {
        const { data, error } = await supabase
            .rpc(
                "get_region_insight_sessions",
                {
                    p_region_id: regionId,
                    p_start_date: startDate,
                    p_end_date: endDate,
                }
            )
            .range(from, from + pageSize - 1);

        if (error) throw error;

        const page = data || [];

        rows.push(...page);

        if (page.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    const sessions = rows.map(mapSessionFromDb);

    const visitorsBySessionId = await loadVisitorsForSessions(
        sessions.map(session => session.id)
    );

    return sessions.map(session => ({
        ...session,
        visitors: visitorsBySessionId.get(session.id) || [],
    }));
}

export async function loadRegionMilestoneCrossings({
    regionId,
    startDate,
    endDate,
    milestones,
}) {
    const { data, error } = await supabase.rpc(
        "get_region_milestone_crossings",
        {
            p_region_id: regionId,
            p_period_start: startDate,
            p_period_end: endDate,
            p_milestones: milestones,
        }
    );

    if (error) throw error;

    return (data || []).map(row => ({
        memberId: row.member_id,
        paxName: row.pax_name,
        milestone: Number(row.milestone) || 0,
        startingTotal: Number(row.starting_total) || 0,
        endingTotal: Number(row.ending_total) || 0,
        postsInPeriod: Number(row.posts_in_period) || 0,
    }));
}

function mapThangCandidateFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        sourceSessionId: row.source_session_id,
        sourceAoName: row.source_ao_name || "",
        sourceDate: row.source_date || null,
        sourceQIds: row.source_q_ids || [],
        title: row.title || "",
        content: row.content || "",
        suggestedEmphasis: row.suggested_emphasis || "",
        couponRequirement: row.coupon_requirement || "unknown",
        terrain: row.terrain || [],
        accessories: row.accessories || [],
        status: row.status || "needs_review",
        reviewedByUserId: row.reviewed_by_user_id || null,
        reviewedAt: row.reviewed_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sourceBackblastLinkId: row.source_backblast_link_id || null,
        terrainOther: row.terrain_other || "",
        accessoriesOther: row.accessories_other || "",
    };
}

function mapThangLibraryItemFromDb(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        title: row.title || "",
        content: row.content || "",
        emphasis: row.emphasis || "",
        couponRequirement: row.coupon_requirement || "unknown",
        terrain: row.terrain || [],
        accessories: row.accessories || [],
        sourceType: row.source_type || "backblast",
        sourceSessionId: row.source_session_id || null,
        sourceAoName: row.source_ao_name || "",
        sourceDate: row.source_date || null,
        sourceQIds: row.source_q_ids || [],
        submittedByUserId: row.submitted_by_user_id || null,
        approvedByUserId: row.approved_by_user_id || null,
        approvedAt: row.approved_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sourceBackblastLinkId: row.source_backblast_link_id || null,
        terrainOther: row.terrain_other || "",
        accessoriesOther: row.accessories_other || "",
    };
}

export async function loadThangCandidates(regionId, { limit = 25, offset = 0 } = {}) {
    const { data, error } = await supabase
        .from("thang_candidates")
        .select("*")
        .eq("region_id", regionId)
        .eq("status", "needs_review")
        .order("source_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;

    return (data || []).map(mapThangCandidateFromDb);
}

export async function insertThangCandidates(regionId, candidates = []) {
    if (!regionId || candidates.length === 0) return [];

    const payload = candidates.map(candidate => ({
        id: candidate.id || crypto.randomUUID(),
        region_id: regionId,
        source_session_id: candidate.sourceSessionId || null,
        source_ao_name: candidate.sourceAoName || null,
        source_date: candidate.sourceDate || null,
        source_q_ids: candidate.sourceQIds || [],
        title: candidate.title || "",
        content: candidate.content || "",
        suggested_emphasis: candidate.suggestedEmphasis || null,
        coupon_requirement: candidate.couponRequirement || "unknown",
        terrain: candidate.terrain || [],
        accessories: candidate.accessories || [],
        status: candidate.status || "needs_review",
        source_backblast_link_id: candidate.sourceBackblastLinkId || null,
        terrain_other: candidate.terrainOther || null,
        accessories_other: candidate.accessoriesOther || null,
    }));

    const { data, error } = await supabase
    .from("thang_candidates")
    .upsert(payload, {
        onConflict: "region_id,source_backblast_link_id",
        ignoreDuplicates: true,
    })
    .select();

    if (error) throw error;

    return (data || []).map(mapThangCandidateFromDb);
}

export async function updateThangCandidateInCloud(regionId, candidate) {
    const { data, error } = await supabase
        .from("thang_candidates")
        .update({
            title: candidate.title || "",
            content: candidate.content || "",
            suggested_emphasis: candidate.suggestedEmphasis || null,
            coupon_requirement: candidate.couponRequirement || "unknown",
            terrain: candidate.terrain || [],
            accessories: candidate.accessories || [],
            status: candidate.status || "needs_review",
            reviewed_by_user_id: candidate.reviewedByUserId || null,
            reviewed_at: candidate.reviewedAt || null,
            updated_at: new Date().toISOString(),
            terrain_other: candidate.terrainOther || null,
            accessories_other: candidate.accessoriesOther || null,
        })
        .eq("id", candidate.id)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapThangCandidateFromDb(data);
}

export async function approveThangCandidate(regionId, candidate, approvedByUserId) {
    const approvedAt = new Date().toISOString();

    const { data: libraryItem, error: libraryError } = await supabase
        .from("thang_library_items")
        .insert({
            region_id: regionId,
            title: candidate.title || "Untitled Thang",
            content: candidate.content || "",
            emphasis: candidate.suggestedEmphasis || null,
            coupon_requirement: candidate.couponRequirement || "unknown",
            terrain: candidate.terrain || [],
            accessories: candidate.accessories || [],
            source_type: "backblast",
            source_session_id: candidate.sourceSessionId || null,
            source_ao_name: candidate.sourceAoName || null,
            source_date: candidate.sourceDate || null,
            source_q_ids: candidate.sourceQIds || [],
            approved_by_user_id: approvedByUserId || null,
            approved_at: approvedAt,
            source_backblast_link_id: candidate.sourceBackblastLinkId || null,
            terrain_other: candidate.terrainOther || null,
            accessories_other: candidate.accessoriesOther || null,
        })
        .select()
        .single();

    if (libraryError) throw libraryError;

    await updateThangCandidateInCloud(regionId, {
        ...candidate,
        status: "approved",
        reviewedByUserId: approvedByUserId || null,
        reviewedAt: approvedAt,
    });

    return mapThangLibraryItemFromDb(libraryItem);
}

export async function rejectThangCandidate(regionId, candidateId, reviewedByUserId) {
    const { data, error } = await supabase
        .from("thang_candidates")
        .update({
            status: "rejected",
            reviewed_by_user_id: reviewedByUserId || null,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", candidateId)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapThangCandidateFromDb(data);
}

export async function loadThangLibraryItems(regionId) {
    const { data, error } = await supabase
        .from("thang_library_items")
        .select("*")
        .eq("region_id", regionId)
        .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map(mapThangLibraryItemFromDb);
}

export async function loadSessionsWithBackblastsForThangExtraction(regionId) {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select(`
                id,
                region_id,
                date,
                ao_id,
                site_id,
                ao_name,
                start_time,
                q_ids,
                q_id,
                workout,
                source_planned_workout_id,
                source_q_slot_id,
                backblast_text
            `)
            .eq("region_id", regionId)
            .not("backblast_text", "is", null)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows = rows.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return rows.map(mapSessionFromDb);
}

export async function loadHistoricalBackblastsForThangExtraction(regionId) {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await supabase
            .from("session_backblast_links")
            .select(`
                id,
                session_id,
                cleaned_content,
                sessions!inner(
                    id,
                    region_id,
                    date,
                    ao_id,
                    ao_name,
                    q_ids,
                    q_id,
                    workout
                )
            `)
            .eq("sessions.region_id", regionId)
            .not("cleaned_content", "is", null)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows = rows.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    return rows;
}

export async function loadQReadiness(regionId, startDate, endDate) {
    const { data: slots, error: slotsError } = await supabase
        .from("q_slots")
        .select(`
            id,
            region_id,
            ao_id,
            date,
            q_user_id,
            preblast_text,
            preblast_posted_at,
            override_time,
            override_title,
            aos (
                id,
                name
            ),
            members!q_slots_q_user_id_fkey (
                id,
                pax_name
            )
        `)
        .eq("region_id", regionId)
        .gte("date", startDate)
        .lte("date", endDate)
        .not("q_user_id", "is", null)
        .order("date", { ascending: true });

    if (slotsError) throw slotsError;

    const slotDates = [...new Set((slots || []).map(slot => slot.date))];

    if (slotDates.length === 0) return [];

    const { data: workouts, error: workoutsError } = await supabase
        .from("planned_workouts")
        .select(`
            id,
            region_id,
            date,
            ao_id,
            ao_name,
            source_q_slot_id,
            is_finalized,
            preblast_text,
            created_by_user_id,
            created_at,
            last_modified_at
        `)
        .eq("region_id", regionId)
        .in("date", slotDates)
        .order("last_modified_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false });

    if (workoutsError) throw workoutsError;

    const creatorUserIds = [
        ...new Set((workouts || [])
            .map(workout => workout.created_by_user_id)
            .filter(Boolean)
        ),
    ];

    let profileByUserId = new Map();

    if (creatorUserIds.length > 0) {
        const { data: profiles, error: profilesError } =
            await supabase.rpc("load_region_profiles_for_admin", {
                target_region_id: regionId,
            });
    
        if (profilesError) throw profilesError;
    
        profileByUserId = new Map(
            (profiles || [])
                .filter(profile => creatorUserIds.includes(profile.id))
                .map(profile => [profile.id, profile])
        );
    }

    const workoutBySlotAndMemberId = new Map();
    const legacyWorkoutMap = new Map();

    (workouts || []).forEach((workout) => {
        const profile = profileByUserId.get(workout.created_by_user_id);
        const ownerMemberId = profile?.member_id || profile?.memberId || null;

        if (!ownerMemberId) return;

        if (workout.source_q_slot_id) {
            const slotOwnerKey =
                `${workout.source_q_slot_id}|${ownerMemberId}`;

            if (!workoutBySlotAndMemberId.has(slotOwnerKey)) {
                workoutBySlotAndMemberId.set(slotOwnerKey, workout);
            }
        }

        const normalizedAoName = normalizeReadinessAoName(workout.ao_name);
        const legacyKey =
            `${workout.date}|${normalizedAoName}|${ownerMemberId}`;

        if (!legacyWorkoutMap.has(legacyKey)) {
            legacyWorkoutMap.set(legacyKey, workout);
        }
    });

    return (slots || []).map((slot) => {
        const aoName = slot.aos?.name || "Unknown AO";
        const normalizedAoName = normalizeReadinessAoName(aoName);
        const slotOwnerKey = `${slot.id}|${slot.q_user_id}`;
        const legacyWorkoutKey =
            `${slot.date}|${normalizedAoName}|${slot.q_user_id}`;

        const workout =
            workoutBySlotAndMemberId.get(slotOwnerKey) ||
            legacyWorkoutMap.get(legacyWorkoutKey);

        return {
            slotId: slot.id,
            date: slot.date,
            time: slot.override_time || "",
            aoId: slot.ao_id,
            aoName,
            qId: slot.q_user_id,
            qName: slot.members?.pax_name || "Unknown Q",
            workoutId: workout?.id || null,
            hasWorkout: Boolean(workout),
            isFinalized: Boolean(workout?.is_finalized),
            hasPreblast: Boolean(
                slot.preblast_posted_at ||
                slot.preblast_text ||
                workout?.preblast_text
            ),
            status: getReadinessStatus(workout, slot),
        };
    });
}

export async function loadSessionAudit(regionId, startDate, endDate) {
    if (!regionId || !startDate || !endDate) return [];

    const { data: slots, error: slotsError } = await supabase
        .from("q_slots")
        .select(`
            id,
            region_id,
            ao_id,
            site_id,
            date,
            start_time,
            q_user_id,
            override_time,
            override_title,
            session_audit_ignored_at,
            session_audit_ignored_by,
            aos (
                id,
                name
            ),
            members!q_slots_q_user_id_fkey (
                id,
                pax_name
            )
        `)
        .eq("region_id", regionId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

    if (slotsError) throw slotsError;

    const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select(`
            id,
            date,
            ao_id,
            ao_name,
            start_time,
            attendee_ids,
            fngs,
            q_ids,
            q_id,
            source_q_slot_id,
            created_at,
            created_by_user_id
        `)
        .eq("region_id", regionId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });

    if (sessionsError) throw sessionsError;

    const duplicateGroups = createPotentialSessionDuplicateGroups(
        sessions || []
    );

    const sessionBySlotId = new Map();
    const legacySessionByAoDate = new Map();

    (sessions || []).forEach(session => {
        if (
            session.source_q_slot_id &&
            !sessionBySlotId.has(session.source_q_slot_id)
        ) {
            sessionBySlotId.set(session.source_q_slot_id, session);
        }

        if (session.source_q_slot_id) return;

        const legacyKey = createSessionAuditLegacyKey({
            date: session.date,
            aoId: session.ao_id,
            aoName: session.ao_name,
        });

        if (!legacySessionByAoDate.has(legacyKey)) {
            legacySessionByAoDate.set(legacyKey, session);
        }
    });

    const rows = (slots || []).map(slot => {
        const aoName = slot.aos?.name || "Unknown AO";
    
        const legacyKey = createSessionAuditLegacyKey({
            date: slot.date,
            aoId: slot.ao_id,
            aoName,
        });
    
        const session =
            sessionBySlotId.get(slot.id) ||
            legacySessionByAoDate.get(legacyKey) ||
            null;
    
        let status = "unclaimed";
    
        if (session) {
            status = "logged";
        } else if (slot.session_audit_ignored_at) {
            status = "ignored";
        } else if (slot.date === getTodayDate()) {
            status = "pending";
        } else if (slot.q_user_id) {
            status = "missing";
        }
    
        return {
            slotId: slot.id,
            date: slot.date,
            time:
                slot.override_time ||
                slot.start_time ||
                "",
            title: slot.override_title || "",
            aoId: slot.ao_id,
            siteId: slot.site_id || null,
            aoName,
            startTime: slot.start_time || null,
            overrideTime: slot.override_time || null,
            qId: slot.q_user_id || null,
            qName: slot.members?.pax_name || "",
            sessionId: session?.id || null,
            ignoredAt: slot.session_audit_ignored_at || null,
            ignoredByUserId: slot.session_audit_ignored_by || null,
            sessionQIds:
                session?.q_ids ||
                (session?.q_id ? [session.q_id] : []),
            matchedBy: session
                ? session.source_q_slot_id
                    ? "q_slot_id"
                    : "ao_date"
                : null,
            status,
        };
    });
    
    return {
        rows,
        duplicateGroups,
    };
}

function createPotentialSessionDuplicateGroups(
    sessions = []
) {
    const groupsByKey = new Map();

    sessions.forEach(session => {
        if (
            !session.id ||
            !session.ao_id ||
            !session.date ||
            !session.created_by_user_id
        ) {
            return;
        }

        const normalizedStartTime =
            normalizeSessionAuditStartTime(
                session.start_time
            );

        const key = [
            session.ao_id,
            session.date,
            normalizedStartTime,
            session.created_by_user_id,
        ].join("|");

        const existing = groupsByKey.get(key) || {
            aoId: session.ao_id,
            aoName:
                session.ao_name ||
                "Unknown AO",
            date: session.date,
            startTime:
                session.start_time ||
                null,
            createdByUserId:
                session.created_by_user_id,
            sessions: [],
        };

        existing.sessions.push({
            sessionId: session.id,
            createdAt:
                session.created_at ||
                null,
            attendanceCount:
                Array.isArray(session.attendee_ids)
                    ? session.attendee_ids.length
                    : 0,
            fngCount:
                Array.isArray(session.fngs)
                    ? session.fngs.length
                    : 0,
        });

        groupsByKey.set(key, existing);
    });

    return [...groupsByKey.values()]
        .filter(group => group.sessions.length > 1)
        .map(group => ({
            ...group,
            sessions: group.sessions.sort(
                compareDuplicateSessions
            ),
        }))
        .sort(compareDuplicateGroups);
}

function normalizeSessionAuditStartTime(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function compareDuplicateSessions(a, b) {
    return String(a.createdAt || "").localeCompare(
        String(b.createdAt || "")
    );
}

function compareDuplicateGroups(a, b) {
    const dateDifference =
        String(b.date || "").localeCompare(
            String(a.date || "")
        );

    if (dateDifference !== 0) {
        return dateDifference;
    }

    const aoDifference =
        String(a.aoName || "").localeCompare(
            String(b.aoName || "")
        );

    if (aoDifference !== 0) {
        return aoDifference;
    }

    return String(a.startTime || "").localeCompare(
        String(b.startTime || "")
    );
}

function createSessionAuditLegacyKey({ date, aoId, aoName }) {
    const normalizedAoName = String(aoName || "")
        .trim()
        .toLowerCase();

    const aoKey = aoId || normalizedAoName;

    return `${date}|${aoKey}`;
}

function normalizeReadinessAoName(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function getReadinessStatus(workout, slot) {
    if (!workout) return "Needs workout";
    if (!workout.is_finalized) return "Workout draft";
    if (!(slot.preblast_posted_at || slot.preblast_text || workout.preblast_text)) return "Needs preblast";
    return "Ready";
}

export async function loadQSources(regionId) {
    const today = getTodayDate();

    const { data, error } = await supabase
        .from("q_sources")
        .select("*")
        .eq("region_id", regionId)
        .eq("is_active", true)
        .or(`starts_on.is.null,starts_on.lte.${today}`)
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order("display_order", { ascending: true });

    if (error) throw error;

    return (data || []).map(mapQSourceFromCloud);
}

export async function loadAllQSources(regionId) {
    const { data, error } = await supabase
        .from("q_sources")
        .select("*")
        .eq("region_id", regionId)
        .order("display_order", { ascending: true });

    if (error) throw error;

    return (data || []).map(mapQSourceFromCloud);
}

export async function insertQSource(regionId, qSource) {
    const { data, error } = await supabase
        .from("q_sources")
        .insert(mapQSourceToCloud(regionId, qSource))
        .select()
        .single();

    if (error) throw error;

    return mapQSourceFromCloud(data);
}

export async function updateQSourceInCloud(regionId, qSource) {
    const { data, error } = await supabase
        .from("q_sources")
        .update(mapQSourceToCloud(regionId, qSource))
        .eq("region_id", regionId)
        .eq("id", qSource.id)
        .select()
        .single();

    if (error) throw error;

    return mapQSourceFromCloud(data);
}

export async function deleteQSourceFromCloud(regionId, qSourceId) {
    const { error } = await supabase
        .from("q_sources")
        .delete()
        .eq("region_id", regionId)
        .eq("id", qSourceId);

    if (error) throw error;
}

export async function updateQSourceDisplayOrder(regionId, qSourceId, displayOrder) {
    const { error } = await supabase
        .from("q_sources")
        .update({
            display_order: displayOrder,
            updated_at: new Date().toISOString(),
        })
        .eq("region_id", regionId)
        .eq("id", qSourceId);

    if (error) throw error;
}

function mapQSourceFromCloud(row) {
    return {
        id: row.id,
        regionId: row.region_id,
        scope: row.scope,
        title: row.title,
        body: row.body,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        isActive: row.is_active,
        createdByUserId: row.created_by_user_id,
        displayOrder: row.display_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapQSourceToCloud(regionId, qSource) {
    return {
        id: qSource.id,
        region_id: regionId,
        scope: qSource.scope || "region",
        title: qSource.title || "",
        body: qSource.body || "",
        starts_on: qSource.startsOn || null,
        ends_on: qSource.endsOn || null,
        is_active: qSource.isActive ?? true,
        created_by_user_id: qSource.createdByUserId || null,
        display_order: qSource.displayOrder ?? 0,
        updated_at: new Date().toISOString(),
    };
}

export async function logLibraryUsageEvent(event) {
    const { error } = await supabase
        .from("library_usage_events")
        .insert(event);

    if (error) {
        throw error;
    }
}

export async function loadRegionProfiles(regionId) {
    const { data, error } = await supabase
        .rpc("load_region_profiles_for_admin", {
            target_region_id: regionId,
        });

    if (error) throw error;
    return data || [];
}

export async function updateProfileRole(profileId, role) {
    const { data, error } = await supabase
        .rpc("update_profile_role", {
            target_profile_id: profileId,
            new_role: role,
        });

    if (error) throw error;
    return data;
}

function mapProfileAoPermissionFromDb(row) {
    return {
        id: row.id,
        profileId: row.profile_id,
        regionId: row.region_id,
        aoId: row.ao_id,
        position: row.ao_position,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id,
    };
}

export async function loadProfileAoPermissions(regionId) {
    const { data, error } = await supabase.rpc(
        "load_profile_ao_permissions",
        {
            p_region_id: regionId,
        }
    );

    if (error) throw error;

    return (data || []).map(mapProfileAoPermissionFromDb);
}

export async function setProfileAoPermissions(
    profileId,
    regionId,
    assignments
) {
    const { data, error } = await supabase.rpc(
        "set_profile_ao_permissions",
        {
            p_profile_id: profileId,
            p_region_id: regionId,
            p_assignments: assignments,
        }
    );

    if (error) throw error;

    return (data || []).map(mapProfileAoPermissionFromDb);
}
function mapAoLeadershipContactFromDb(row) {
    return {
        aoId: row.ao_id,
        aoName: row.ao_name ||"",
        position: row.ao_position,
        profileId: row.profile_id,
        displayName: row.display_name || "",
        email: row.email || "",
    };
}

export async function loadAoLeadershipContacts(regionId) {
    const { data, error } = await supabase.rpc("load_ao_leadership_contacts", {
        p_region_id: regionId,
    });

    if (error) throw error;

    return (data || []).map(mapAoLeadershipContactFromDb);
}

function mapProfileRegionPositionFromDb(row) {
    return {
        id: row.id,
        profileId: row.profile_id,
        regionId: row.region_id,
        position: row.region_position,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id,
    };
}

export async function loadProfileRegionPositions(regionId) {
    const { data, error } = await supabase.rpc(
        "load_profile_region_positions",
        {
            p_region_id: regionId,
        }
    );

    if (error) throw error;

    return (data || []).map(mapProfileRegionPositionFromDb);
}

export async function setProfileRegionPositions(profileId, regionId, positions = []) {
    const { data, error } = await supabase.rpc(
        "set_profile_region_positions",
        {
            p_profile_id: profileId,
            p_region_id: regionId,
            p_positions: positions,
        }
    );

    if (error) throw error;

    return (data || []).map(mapProfileRegionPositionFromDb);
}

export async function loadPlannerAnnouncements(regionId) {
    const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("region_id", regionId)
        .eq("is_active", true)
        .order("display_order", {
            ascending: true,
            nullsFirst: false,
        })
        .order("created_at", {
            ascending: false,
        });

    if (error) throw error;

    return (data || []).map(mapAnnouncementFromDb);
}

export async function loadMemberCommunityData(regionId, memberId) {
    if (!regionId || !memberId) {
        return {
            uniquePaxCount: 0,
            uniqueAoCount: 0,
            battleBuddies: [],
            sharedAos: [],
        };
    }

    const sessions = await loadMemberCommunitySessions(
        regionId,
        memberId
    );

    const buddyStatsByMemberId = new Map();
    const aoStatsByKey = new Map();
    const uniquePaxIds = new Set();
    const uniqueAoKeys = new Set();

    sessions.forEach(session => {
        const attendeeIds = Array.isArray(session.attendeeIds)
            ? [...new Set(session.attendeeIds.filter(Boolean))]
            : [];

        attendeeIds.forEach(attendeeId => {
            if (attendeeId === memberId) return;

            uniquePaxIds.add(attendeeId);

            const existing = buddyStatsByMemberId.get(attendeeId) || {
                memberId: attendeeId,
                sharedPosts: 0,
                firstSharedDate: null,
                lastSharedDate: null,
            };

            existing.sharedPosts += 1;

            if (
                !existing.firstSharedDate ||
                session.date < existing.firstSharedDate
            ) {
                existing.firstSharedDate = session.date;
            }

            if (
                !existing.lastSharedDate ||
                session.date > existing.lastSharedDate
            ) {
                existing.lastSharedDate = session.date;
            }

            buddyStatsByMemberId.set(attendeeId, existing);
        });

        const normalizedAoName = String(session.aoName || "")
            .trim()
            .toLowerCase();

        if (
            normalizedAoName === "the sandbox" ||
            normalizedAoName === "other" ||
            normalizedAoName === "blackops" ||
            normalizedAoName === "csaup" ||
            normalizedAoName.startsWith("convergence")
        ) {
            return;
        }

        if (!session.aoId) {
            return;
        }

        const aoKey = session.aoId;
        uniqueAoKeys.add(aoKey);

        const existingAo = aoStatsByKey.get(aoKey) || {
            aoId: session.aoId || null,
            aoName: session.aoName || "Unknown AO",
            posts: 0,
            firstPostDate: null,
            lastPostDate: null,
        };

        existingAo.posts += 1;

        if (
            !existingAo.firstPostDate ||
            session.date < existingAo.firstPostDate
        ) {
            existingAo.firstPostDate = session.date;
        }

        if (
            !existingAo.lastPostDate ||
            session.date > existingAo.lastPostDate
        ) {
            existingAo.lastPostDate = session.date;
        }

        aoStatsByKey.set(aoKey, existingAo);
    });

    const battleBuddies = [...buddyStatsByMemberId.values()]
        .sort((a, b) => {
            if (b.sharedPosts !== a.sharedPosts) {
                return b.sharedPosts - a.sharedPosts;
            }

            return String(b.lastSharedDate || "")
                .localeCompare(String(a.lastSharedDate || ""));
        });

    const sharedAos = [...aoStatsByKey.values()]
        .sort((a, b) => {
            if (b.posts !== a.posts) {
                return b.posts - a.posts;
            }

            return a.aoName.localeCompare(b.aoName);
        });

    return {
        uniquePaxCount: uniquePaxIds.size,
        uniqueAoCount: uniqueAoKeys.size,
        battleBuddies,
        sharedAos,
    };
}

export async function loadMemberCommunitySessions(regionId, memberId) {
    if (!regionId || !memberId) return [];

    const pageSize = 1000;
    let from = 0;
    const sessions = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select(`
                id,
                date,
                ao_id,
                site_id,
                ao_name,
                start_time,
                attendee_ids,
                q_ids,
                q_id,
                fngs
            `)
            .eq("region_id", regionId)
            .or(
                `attendee_ids.cs.["${memberId}"],` +
                `q_ids.cs.{${memberId}},` +
                `q_id.eq.${memberId}`
            )
            .order("date", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data?.length) break;

        sessions.push(...data.map(mapSessionFromDb));

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return sessions;
}

export async function ignoreSessionAuditSlot(regionId, qSlotId) {
    if (!regionId || !qSlotId) {
        throw new Error("A region ID and Q slot ID are required.");
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
        throw userError;
    }

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const { error } = await supabase
        .from("q_slots")
        .update({
            session_audit_ignored_at: new Date().toISOString(),
            session_audit_ignored_by: user.id,
        })
        .eq("id", qSlotId)
        .eq("region_id", regionId);

    if (error) {
        throw error;
    }
}

export async function restoreSessionAuditSlot(regionId, qSlotId) {
    if (!regionId || !qSlotId) {
        throw new Error("A region ID and Q slot ID are required.");
    }

    const { error } = await supabase
        .from("q_slots")
        .update({
            session_audit_ignored_at: null,
            session_audit_ignored_by: null,
        })
        .eq("id", qSlotId)
        .eq("region_id", regionId);

    if (error) {
        throw error;
    }
}

export async function loadOperationsOverview(
    regionId = null
) {
    const { data, error } = await supabase.rpc(
        "get_operations_overview",
        {
            p_region_id: regionId || null,
        }
    );

    if (error) throw error;

    return {
        generatedAt: data?.generatedAt || null,

        scope: {
            regionId:
                data?.scope?.regionId || null,
        },

        users: {
            total:
                Number(data?.users?.total) || 0,
            linkedPax:
                Number(data?.users?.linkedPax) || 0,
            new7d:
                Number(data?.users?.new7d) || 0,
            new30d:
                Number(data?.users?.new30d) || 0,
        },

        activity: {
            active7d:
                Number(data?.activity?.active7d) || 0,
            active30d:
                Number(data?.activity?.active30d) || 0,
            appOpensToday:
                Number(
                    data?.activity?.appOpensToday
                ) || 0,
        },

        usage7d: {
            sessionsLogged:
                Number(
                    data?.usage7d?.sessionsLogged
                ) || 0,
            workoutsCreated:
                Number(
                    data?.usage7d?.workoutsCreated
                ) || 0,
            executionsStarted:
                Number(
                    data?.usage7d?.executionsStarted
                ) || 0,
            backblastsGenerated:
                Number(
                    data?.usage7d
                        ?.backblastsGenerated
                ) || 0,
        },

        health: {
            status:
                data?.health?.status ||
                "not_configured",
            criticalCount:
                Number(
                    data?.health?.criticalCount
                ) || 0,
            warningCount:
                Number(
                    data?.health?.warningCount
                ) || 0,
            passingCount:
                Number(
                    data?.health?.passingCount
                ) || 0,
            lastAuditAt:
                data?.health?.lastAuditAt || null,
        },
    };
}

export async function loadMemberMerges() {
    const { data, error } = await supabase.rpc(
        "load_member_merges"
    );

    if (error) throw error;

    return data || [];
}

export async function loadMemberMerge(
    mergeId
) {
    if (!mergeId) {
        throw new Error(
            "Merge id is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "load_member_merge",
        {
            p_merge_id: mergeId,
        }
    );

    if (error) throw error;

    return data;
}

export async function executeMemberMerge(
    mergeId,
    expectedPlanHash
) {
    if (!mergeId) {
        throw new Error(
            "Merge id is required."
        );
    }

    if (!expectedPlanHash) {
        throw new Error(
            "Expected plan hash is required."
        );
    }

    const { data, error } = await supabase.rpc(
        "execute_member_merge",
        {
            p_merge_id: mergeId,
            p_expected_plan_hash:
                expectedPlanHash,
        }
    );

    if (error) throw error;

    return data;
}

export async function loadMembersByIds(
    regionId,
    memberIds = []
) {
    const cleanIds = [
        ...new Set(memberIds.filter(Boolean)),
    ];

    if (!regionId || cleanIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from("members")
        .select("*")
        .eq("region_id", regionId)
        .in("id", cleanIds);

    if (error) throw error;

    const inviterRelationships =
        await loadMemberInviters(cleanIds);

    const inviterIdsByMemberId = new Map();

    inviterRelationships.forEach(relationship => {
        const existing =
            inviterIdsByMemberId.get(
                relationship.memberId
            ) || [];

        if (
            relationship.inviterMemberId &&
            !existing.includes(
                relationship.inviterMemberId
            )
        ) {
            existing.push(
                relationship.inviterMemberId
            );
        }

        inviterIdsByMemberId.set(
            relationship.memberId,
            existing
        );
    });

    return (data || []).map(row => {
        const member = mapMemberFromDb(row);

        const inviterIds = [
            ...new Set([
                member.invitedById,
                ...(inviterIdsByMemberId.get(
                    member.id
                ) || []),
            ].filter(Boolean)),
        ];

        return {
            ...member,
            inviterIds,
            invitedById: inviterIds[0] || null,
        };
    });
}

export async function joinRegion(regionId, password) {
    if (!regionId) {
        throw new Error("Region ID is required.");
    }

    if (!password?.trim()) {
        throw new Error("Region password is required.");
    }

    const { data, error } = await supabase.rpc("join_region", {
        p_region_id: regionId,
        p_password: password,
    });

    if (error) {
        if (
            error.message?.includes("invalid_region_credentials") ||
            error.details?.includes("invalid_region_credentials")
        ) {
            throw new Error("Incorrect region password.");
        }

        if (
            error.message?.includes("authentication_required") ||
            error.details?.includes("authentication_required")
        ) {
            throw new Error("You must be signed in to join a region.");
        }

        console.error("Failed to join region:", error);
        throw new Error("Unable to join the region. Please try again.");
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.region_id) {
        throw new Error("Region enrollment did not return a valid result.");
    }

    return result;
}

export async function loadRegionLeadershipDirectory(regionId) {
    if (!regionId) {
        throw new Error("Region id is required to load leadership directory.");
    }

    const { data, error } = await supabase.rpc(
        "load_region_leadership_directory",
        {
            p_region_id: regionId,
        },
    );

    if (error) {
        console.error("Failed to load leadership directory:", error);
        throw error;
    }

    return (data ?? []).map((row) => ({
        scope: row.scope,
        regionId: row.region_id,
        aoId: row.ao_id,
        aoName: row.ao_name,
        positionKey: row.position_key,
        displayOrder: row.display_order,
        profileId: row.profile_id,
        memberId: row.member_id,
        paxName: row.pax_name,
    }));
}