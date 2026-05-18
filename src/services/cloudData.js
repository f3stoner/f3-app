import { APP_EVENTS } from "../constants/appEvents.js";
import { generateBackblast } from "../modules/backblast.js";
import { logAppEvent } from "./appEvents.js";
import { supabase } from "./supabaseClient.js";

export async function loadAllSessions(regionId) {
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

    return allSessions;
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
    ] = await Promise.all([
        supabase
            .from("regions")
            .select("*")
            .eq("id", regionId)
            .single(),

        loadAllMembers(regionId),

        loadAllSessions(regionId),

        supabase
            .from("planned_workouts")
            .select("*")
            .eq("region_id", regionId),

        supabase
            .from("aos")
            .select("*")
            .eq("region_id", regionId),

        loadAllQSlots(regionId),

        loadAdminFlags(regionId),

        supabase
            .from("saved_planner_sections")
            .select("*")
            .eq("region_id", regionId)
            .order("last_used_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false }),
    ]);

    if (regionResult.error) throw regionResult.error;
    if (sessionResult.error) throw sessionResult.error;
    if (plannedWorkoutResult.error) throw plannedWorkoutResult.error;
    if (aoResult.error) throw aoResult.error;
    if (savedPlannerSectionResult.error) throw savedPlannerSectionResult.error;
    
    console.log("Loaded members count:", memberResult.length);
    console.log("RAW memberResult length:", memberResult.length);
    console.log("RAW sessionResult length:", sessionResult.length);
    return {
        regionName: regionResult.data.name,
        members: memberResult.map(mapMemberFromDb),
        sessions: sessionResult.map(mapSessionFromDb),
        plannedWorkouts: plannedWorkoutResult.data.map(mapPlannedWorkoutFromDb),
        aos: aoResult.data.map(mapAoFromDb),
        qSlots: qSlotResult.map(mapQSlotFromDb),
        adminFlags: adminFlagResult,
        savedPlannerSections: (savedPlannerSectionResult.data || [])
            .map(mapSavedPlannerSectionFromDb),
        workoutFieldLabels: regionResult.data.workout_field_labels || {},
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
        unresolvedPax: row.unresolved_pax || [],
        weatherSnapshot: row.weather_snapshot || null,
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
        timers: row.timers || [],
        preblastText: row.preblast_text || "",
        preblastLastModifiedAt: row.preblast_last_modified_at || null,
    };
}

function mapAoFromDb(row) {
    return {
        id: row.id,
        name: row.name,
        locationName: row.location_name,
        daysOfWeek: row.days_of_week || [],
        time: row.time,
        isActive: row.is_active ?? true,
        createdAt: row.created_at,
        address: row.address || "",
        mapUrl: row.map_url || "",
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
                unresolved_pax: session.unresolvedPax || [],
                weather_snapshot: session.weatherSnapshot || null,
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

    return savedSession;
}

export async function updateSessionInCloud(regionId, session) {
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
            unresolved_pax: session.unresolvedPax || [],
            weather_snapshot: session.weatherSnapshot || null,
        })
        .eq("id", session.id)
        .select()
        .single();

    if (error) throw error;

    return mapSessionFromDb(data);
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
                timers: workout.timers || [],
                preblast_text: workout.preblastText || null,
                preblast_last_modified_at: workout.preblastLastModifiedAt || null,
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
    console.log("updatePlannedWorkoutInCloud regionId:", regionId);
    console.log("updatePlannedWorkoutInCloud workout:", workout);

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
            timers: workout.timers || [],
            preblast_text: workout.preblastText || null,
            preblast_last_modified_at: workout.preblastLastModifiedAt || null,
        })
        .eq("id", workout.id)
        .select()
        .single();

    console.log("updatePlannedWorkoutInCloud data:", data);
    console.log("updatePlannedWorkoutInCloud error:", error);

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

export async function deleteSessionFromCloud(regionId, sessionId) {
    const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId)
        .eq("region_id", regionId)

    if (error) throw error;
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
                is_active: ao.isActive ?? true,
                created_at: ao.createdAt,
                address: ao.address || null,
                map_url: ao.mapUrl || null,
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
            is_active: ao.isActive ?? true,
            created_at: ao.createdAt,
            address: ao.address || null,
            map_url: ao.mapUrl || null,
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