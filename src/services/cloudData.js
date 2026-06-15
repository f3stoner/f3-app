import { APP_EVENTS } from "../constants/appEvents.js";
import { logAppEvent } from "./appEvents.js";
import { supabase } from "./supabaseClient.js";
import { AO_WORKOUT_EMPHASIS_RULES } from "../config.js";
import { subscribeToManagedChannel, unsubscribeManagedChannel } from "./realtime.js";

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
                ao_name,
                attendee_ids,
                q_ids,
                q_id,
                fngs,
                source_planned_workout_id,
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
            ao_name,
            attendee_ids,
            q_ids,
            q_id,
            fngs,
            notes,
            workout,
            source_planned_workout_id,
            created_at,
            created_by_user_id,
            backblast_text,
            backblast_status,
            backblast_posted_at,
            unresolved_pax,
            weather_snapshot,
            attendance_review_status,
            attendance_review_notes
        `)
        .eq("region_id", regionId)
        .gte("date", cutoff)
        .order("date", { ascending: false });

    if (error) throw error;

    return data || [];
}

export async function loadOlderSessionsPage(regionId, beforeDate, limit = 100) {
    if (!regionId || !beforeDate) return [];

    const { data, error } = await supabase
        .from("sessions")
        .select(`
            id,
            region_id,
            date,
            ao_name,
            attendee_ids,
            q_ids,
            q_id,
            fngs,
            notes,
            workout,
            source_planned_workout_id,
            created_at,
            created_by_user_id,
            backblast_text,
            backblast_status,
            backblast_posted_at,
            unresolved_pax,
            weather_snapshot,
            attendance_review_status,
            attendance_review_notes
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

async function timed(label, promise) {
    console.time(label);
    const result = await promise;
    console.timeEnd(label);
    return result;
}

export async function loadRegionData(regionId) {
    const [
        regionResult,
        memberResult,
        sessionResult,
        plannedWorkoutResult,
        aoResult,
        qSlotResult,
        adminFlagResult,
        savedPlannerSectionResult,
        announcementResult,
        memberStatsResult,
    ] = await Promise.all([
        timed(
            "loadRegionData:region",
            supabase
                .from("regions")
                .select("*")
                .eq("id", regionId)
                .single()
        ),

        timed("loadRegionData:members", loadAllMembers(regionId)),

        timed("loadRegionData:sessions", loadRecentSessions(regionId)),

        timed(
            "loadRegionData:plannedWorkouts",
            supabase
                .from("planned_workouts")
                .select("*")
                .eq("region_id", regionId)
        ),

        timed(
            "loadRegionData:aos",
            supabase
                .from("aos")
                .select("*")
                .eq("region_id", regionId)
        ),

        timed("loadRegionData:qSlots", loadAllQSlots(regionId)),

        timed("loadRegionData:adminFlags", loadAdminFlags(regionId)),

        timed(
            "loadRegionData:savedPlannerSections",
            supabase
                .from("saved_planner_sections")
                .select("*")
                .eq("region_id", regionId)
                .order("last_used_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
        ),

        timed("loadRegionData:announcements", loadAnnouncements(regionId)),

        timed("loadRegionData:memberStats", loadRegionMemberStats(regionId)),
    ]);

    const backblastLinksBySessionId = new Map();

    if (regionResult.error) throw regionResult.error;
    if (sessionResult.error) throw sessionResult.error;
    if (plannedWorkoutResult.error) throw plannedWorkoutResult.error;
    if (aoResult.error) throw aoResult.error;
    if (savedPlannerSectionResult.error) throw savedPlannerSectionResult.error;
    
    return {
        regionName: regionResult.data.name,
        members: memberResult.map(mapMemberFromDb),
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
        qSlots: qSlotResult.map(mapQSlotFromDb),
        adminFlags: adminFlagResult,
        savedPlannerSections: (savedPlannerSectionResult.data || [])
            .map(mapSavedPlannerSectionFromDb),
        workoutFieldLabels: regionResult.data.workout_field_labels || {},
        announcements: announcementResult,
        memberStats: memberStatsResult,
        memberStatsByMemberId: Object.fromEntries(
            memberStatsResult.map(stats => [stats.memberId, stats])
        ),
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
    return {
        id: row.id,
        paxName: row.pax_name,
        realName: row.real_name,
        homeAo: row.home_ao,
        invitedById: row.invited_by_id,
        firstPostDate: row.first_post_date,
        status: row.status,
    };
}

export function mapSessionFromDb(row) {
    return {
        id: row.id,
        date: row.date,
        aoName: row.ao_name,
        attendeeIds: row.attendee_ids || [],
        qIds: row.q_ids || (row.q_id ? [row.q_id] : []),
        fngs: row.fngs || [],
        notes: row.notes || "",
        workout: row.workout || null,
        sourcePlannedWorkoutId: row.source_planned_workout_id,
        createdAt: row.created_at,
        createdByUserId: row.created_by_user_id || null,
        backblastText: row.backblast_text || "",
        backblastStatus: row.backblast_status || null,
        backblastPostedAt: row.backblast_posted_at || null,
        unresolvedPax: row.unresolved_pax || [],
        weatherSnapshot: row.weather_snapshot || null,
        startTime: row.start_time || null,
        attendanceReviewStatus: row.attendance_review_status || "not_required",
        attendanceReviewNotes: row.attendance_review_notes || "",
    };
}

function mapPlannedWorkoutFromDb(row) {
    return {
        id: row.id,
        date: row.date,
        aoName: row.ao_name,
        title: row.title || "",
        introduction: row.introduction || "",
        warmorama: row.warmorama || "",
        thangs: row.thangs || "",
        finisher: row.finisher || "",
        notes: row.notes || "",
        sourceWorkoutId: null,
        sourceSessionId: row.source_session_id,
        createdAt: row.created_at,
        lastModifiedAt: row.last_modified_at,
        createdByUserId: row.created_by_user_id || null,
        isShared: row.is_shared ?? true,
        isFinalized: row.is_finalized ?? false,
        timers: row.timers || [],
        preblastText: row.preblast_text || "",
        preblastLastModifiedAt: row.preblast_last_modified_at || null,
        thangSections: row.thang_sections || null,
        announcementText: row.announcement_text || "",
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

function mapQSlotFromDb(row) {
    return {
        id: row.id,
        aoId: row.ao_id,
        date: row.date,
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
                invited_by_id: member.invitedById || null,
                first_post_date: member.firstPostDate || null,
                status: member.status,
            },
        ])
        .select()
        .single();
    if (error) throw error;

    return mapMemberFromDb(data);
}

export async function updateMemberInCloud(regionId, member) {
    const { data, error } = await supabase
        .from("members")
        .update({
            region_id: regionId,
            pax_name: member.paxName,
            real_name: member.realName || null,
            home_ao: member.homeAo || null,
            invited_by_id: member.invitedById || null,
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

export async function insertSession(regionId, session) {
    const { data, error } = await supabase
        .from("sessions")
        .insert([
            {
                id: session.id,
                region_id: regionId,
                date: session.date,
                ao_name: session.aoName,
                q_ids: session.qIds || [],
                q_id: session.qIds?.[0] || null,
                attendee_ids: session.attendeeIds || [],
                fngs: session.fngs || [],
                notes: session.notes || "",
                workout: session.workout || null,
                source_planned_workout_id: session.sourcePlannedWorkoutId || null,
                created_at: session.createdAt,
                created_by_user_id: session.createdByUserId,
                backblast_text: session.backblastText || "",
                backblast_status: session.backblastStatus || null,
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
            ao_name: session.aoName,
            q_ids: session.qIds || [],
            q_id: session.qIds?.[0] || null,
            attendee_ids: session.attendeeIds || [],
            fngs: session.fngs || [],
            notes: session.notes || "",
            workout: session.workout || null,
            source_planned_workout_id: session.sourcePlannedWorkoutId || null,
            created_at: session.createdAt,
            backblast_text: session.backblastText || "",
            backblast_status: session.backblastStatus || null,
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
                ao_name: workout.aoName,
                title: workout.title || "",
                introduction: workout.introduction || "",
                warmorama: workout.warmorama || "",
                thangs: workout.thangs || "",
                finisher: workout.finisher || "",
                notes: workout.notes || "",
                source_session_id: workout.sourceSessionId || null,
                created_at: workout.createdAt,
                last_modified_at: workout.lastModifiedAt || null,
                created_by_user_id: workout.createdByUserId || null,
                is_shared: workout.isShared ?? false,
                is_finalized: workout.isFinalized ?? false,
                timers: workout.timers || [],
                preblast_text: workout.preblastText || null,
                preblast_last_modified_at: workout.preblastLastModifiedAt || null,
                thang_sections: workout.thangSections || null,
                announcement_text: workout.announcementText || null,
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
            ao_name: workout.aoName,
            title: workout.title || "",
            introduction: workout.introduction || "",
            warmorama: workout.warmorama || "",
            thangs: workout.thangs || "",
            finisher: workout.finisher || "",
            notes: workout.notes || "",
            source_session_id: workout.sourceSessionId || null,
            created_at: workout.createdAt,
            last_modified_at: workout.lastModifiedAt || null,
            created_by_user_id: workout.createdByUserId || null,
            is_shared: workout.isShared ?? false,
            is_finalized: workout.isFinalized ?? false,
            timers: workout.timers || [],
            preblast_text: workout.preblastText || null,
            preblast_last_modified_at: workout.preblastLastModifiedAt || null,
            thang_sections: workout.thangSections || null,
            announcement_text: workout.announcementText || null,
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
            ao_name: session.aoName,
            q_ids: cleanQIds,
            q_id: cleanQIds[0] || null,
            attendee_ids: session.attendeeIds || [],
            fngs: session.fngs || [],
            notes: session.notes || "",
            workout: session.workout || null,
            source_planned_workout_id: session.sourcePlannedWorkoutId || null,
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

export async function insertAo(regionId, ao) {
    const { data, error } = await supabase
        .from("aos")
        .insert([
            {
                id: ao.id,
                region_id: regionId,
                name: ao.name,
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
    const { data, error } = await supabase
        .from("regions")
        .select("*")
        .order("name", { ascending: true });

    if (error) throw error;
    return (data || []).map(mapRegionFromDb);
}

export async function getRegionById(regionId) {
    const { data, error } = await supabase
        .from("regions")
        .select("*")
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

export async function grantRegionAccess(userId, regionId) {
    const { error } = await supabase
        .from("region_access")
        .insert({
            user_id: userId,
            region_id: regionId
        });

    if (error && error.code !== "23505") throw error;
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
                push_subscription: settings.push_subscription ?? null,
            },
            { onConflict: "user_id" }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
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

export async function loadAdminFlags(regionId) {
    const { data, error } = await supabase
        .from("admin_flags")
        .select("*")
        .eq("region_id", regionId);

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
        regionPassword: row.region_password || null,
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

export function getAffectedMemberIdsFromSession(session) {
    const ids = new Set();

    (session?.attendeeIds || []).forEach(id => {
        if (id) ids.add(id);
    });

    (session?.qIds || []).forEach(id => {
        if (id) ids.add(id);
    });

    (session?.fngs || []).forEach(fng => {
        const invitedById = fng?.invitedById || fng?.invited_by_id;

        if (invitedById) {
            ids.add(invitedById);
        }
    });

    return [...ids];
}

export async function rebuildMemberStatsForMembers(regionId, memberIds = []) {
    const uniqueIds = [...new Set(memberIds)].filter(Boolean);

    if (!regionId || uniqueIds.length === 0) return;

    const results = await Promise.allSettled(
        uniqueIds.map(memberId =>
            supabase.rpc("rebuild_member_stats_for_member", {
                target_region_id: regionId,
                target_member_id: memberId,
            })
        )
    );

    const failed = results.filter(
        result => result.status === "rejected" || result.value?.error
    );

    if (failed.length > 0) {
        console.warn("Some member stats rebuilds failed:", failed);
    }
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
            ao_name,
            attendee_ids,
            q_ids,
            q_id,
            fngs,
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
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("region_id", regionId)
        .eq("is_active", true)
        .or(`starts_on.is.null,starts_on.lte.${today}`)
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

    if (error) throw error;

    return (data || []).map(mapAnnouncementFromDb);
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

    export async function insertAnnouncement(regionId, announcement) {
        const payload = {
            id: announcement.id,
            region_id: regionId,
            scope: announcement.scope || "region",
            ao_id: announcement.aoId || null,
            title: announcement.title || "",
            body: announcement.body || "",
            starts_on: announcement.startsOn || null,
            ends_on: announcement.endsOn || null,
            is_active: announcement.isActive ?? true,
            created_by_user_id: announcement.createdByUserId || null,
            include_in_backblast: announcement.includeInBackblast ?? false,
            display_order: announcement.displayOrder ?? Date.now(),
        };
    
        const { error } = await supabase
            .from("announcements")
            .insert(payload);
    
        if (error) throw error;
    
        return mapAnnouncementFromDb(payload);
    }

    export async function updateAnnouncementInCloud(regionId, announcement) {
    const { data, error } = await supabase
        .from("announcements")
        .update({
            scope: announcement.scope || "region",
            ao_id: announcement.aoId || null,
            title: announcement.title || "",
            body: announcement.body || "",
            starts_on: announcement.startsOn || null,
            ends_on: announcement.endsOn || null,
            is_active: announcement.isActive ?? true,
            updated_at: new Date().toISOString(),
            include_in_backblast: announcement.includeInBackblast ?? false,
            display_order: announcement.displayOrder ?? 0,
        })
        .eq("id", announcement.id)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapAnnouncementFromDb(data);
}

export async function deleteAnnouncementFromCloud(regionId, announcementId) {
    const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", announcementId)
        .eq("region_id", regionId);

    if (error) throw error;
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
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        includeInBackblast: row.include_in_backblast ?? false,
        displayOrder: row.display_order ?? 999,
    };
}

export async function updateAnnouncementDisplayOrder(regionId, announcementId, displayOrder) {
    const { error } = await supabase.rpc("reorder_announcement", {
        target_region_id: regionId,
        announcement_id: announcementId,
        new_display_order: displayOrder,
    });

    if (error) throw error;
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
        fngsEh: row.fngs_eh ?? 0,
        favoriteAo: row.favorite_ao ?? null,
        lastPostDate: row.last_post_date ?? null,
        firstPostDate: row.first_post_date ?? null,
        lastQDate: row.last_q_date ?? null,
    };
}

export async function loadAoInsightMonths({ regionId, aoName }) {
    const { data, error } = await supabase.rpc("get_ao_insight_months", {
        p_region_id: regionId,
        p_ao_name: aoName,
    });

    if (error) throw error;

    return (data || []).map(row => row.month_key);
}

export async function loadAoInsightSessions({ regionId, aoName, startDate, endDate }) {
    const { data, error } = await supabase.rpc("get_ao_insight_sessions", {
        p_region_id: regionId,
        p_ao_name: aoName,
        p_start_date: startDate,
        p_end_date: endDate,
    });

    if (error) throw error;

    return (data || []).map(mapSessionFromDb);
}

export async function loadSessionBackblastLinks() {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await supabase
            .from("session_backblast_links")
            .select("session_id, band_post_key")
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows = rows.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return rows;
}

export async function insertSessionBackblastLink(row) {
    const { data, error } = await supabase
        .from("session_backblast_links")
        .insert(row)
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function insertBackblastReviewDecision(row) {
    const { data, error } = await supabase
        .from("backblast_review_decisions")
        .upsert(row, {
            onConflict: "region_id,band_post_key",
        })
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function loadBackblastReviewDecisions() {
    const pageSize = 1000;
    let from = 0;
    let rows = [];

    while (true) {
        const { data, error } = await supabase
            .from("backblast_review_decisions")
            .select("band_post_key, decision_type, session_id, notes")
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows = rows.concat(data);

        if (data.length < pageSize) break;

        from += pageSize;
    }

    return rows;
}

export async function searchOpenSessionsForBackblastReview({
    regionId,
    date,
    aoName,
    linkedSessionIds = [],
}) {
    let query = supabase
        .from("sessions")
        .select("id, date, ao_name, start_time, q_ids, attendee_ids, fngs, notes, backblast_text, attendance_review_status, attendance_review_notes")
        .eq("region_id", regionId)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(50);

    if (date) {
        query = query.eq("date", date);
    }

    if (aoName) {
        query = query.eq("ao_name", aoName);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
}

export async function insertSessionFromBackblastReview(regionId, session) {
    const { data, error } = await supabase
        .from("sessions")
        .insert({
            region_id: regionId,
            id: session.id,
            date: session.date,
            ao_name: session.aoName,
            q_ids: session.qIds || [],
            attendee_ids: session.attendeeIds || [],
            fngs: session.fngs || [],
            notes: session.notes || "",
            backblast_text: session.backblastText || null,
            start_time: session.startTime || null,
            created_by_user_id: session.createdByUserId || null,
            created_at: session.createdAt,
            attendance_review_status: session.attendanceReviewStatus || "not_required",
            attendance_review_notes: session.attendanceReviewNotes || null,
        })
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function loadAttendanceReviewSessions(regionId) {
    if (!regionId) return [];

    const { data, error } = await supabase
        .from("sessions")
        .select(`
            id,
            region_id,
            date,
            ao_name,
            attendee_ids,
            q_ids,
            q_id,
            fngs,
            notes,
            backblast_text,
            start_time,
            attendance_review_status,
            attendance_review_notes
        `)
        .eq("region_id", regionId)
        .eq("attendance_review_status", "pending")
        .order("date", { ascending: false });

    if (error) throw error;

    return (data || []).map(mapSessionFromDb);
}

export async function updateSessionAttendanceReviewStatus(regionId, sessionId, status, notes = null) {
    const { data, error } = await supabase
        .from("sessions")
        .update({
            attendance_review_status: status,
            attendance_review_notes: notes,
        })
        .eq("id", sessionId)
        .eq("region_id", regionId)
        .select()
        .single();

    if (error) throw error;

    return mapSessionFromDb(data);
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
                ao_name,
                q_ids,
                q_id,
                workout,
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
            )
        `)
        .eq("region_id", regionId)
        .gte("date", startDate)
        .lte("date", endDate)
        .not("q_user_id", "is", null)
        .order("date", { ascending: true });

    if (slotsError) throw slotsError;

    const slotDates = [...new Set((slots || []).map(slot => slot.date))];

    const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id, pax_name")
        .eq("region_id", regionId);

    if (membersError) throw membersError;

    const { data: workouts, error: workoutsError } = await supabase
    .from("planned_workouts")
    .select(`
        id,
        region_id,
        date,
        ao_name,
        is_finalized,
        preblast_text
    `)
    .eq("region_id", regionId)
    .in("date", slotDates);

    if (workoutsError) throw workoutsError;

    const memberMap = new Map(
        (members || []).map(member => [member.id, member])
    );

    const workoutMap = new Map();

    (workouts || []).forEach((workout) => {
        const normalizedAoName = normalizeReadinessAoName(workout.ao_name);
        const key = `${workout.date}|${normalizedAoName}`;
    
        workoutMap.set(key, workout);
    });

    return (slots || []).map((slot) => {
        const aoName = slot.aos?.name || "Unknown AO";
        const normalizedAoName = normalizeReadinessAoName(aoName);
        const workoutKey =
        `${slot.date}|${normalizedAoName}`;
        const workout = workoutMap.get(workoutKey);
        const member = memberMap.get(slot.q_user_id);

        return {
            slotId: slot.id,
            date: slot.date,
            time: slot.override_time || "",
            aoId: slot.ao_id,
            aoName,
            qId: slot.q_user_id,
            qName: member?.pax_name || "Unknown Q",
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