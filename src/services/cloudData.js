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

export async function loadRegionData(regionId) {
    const [
        regionResult,
        memberResult,
        sessionResult,
        plannedWorkoutResult,
        aoResult,
        qSlotResult,
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

        supabase
            .from("q_slots")
            .select("*")
            .eq("region_id", regionId),
    ]);

    if (regionResult.error) throw regionResult.error;
    if (sessionResult.error) throw sessionResult.error;
    if (plannedWorkoutResult.error) throw plannedWorkoutResult.error;
    if (aoResult.error) throw aoResult.error;
    if (qSlotResult.error) throw qSlotResult.error;
    
    console.log("Loaded members count:", memberResult.length);
    console.log("RAW memberResult length:", memberResult.length);
    console.log("RAW sessionResult length:", sessionResult.length);
    return {
        regionName: regionResult.data.name,
        members: memberResult.map(mapMemberFromDb),
        sessions: sessionResult.map(mapSessionFromDb),
        plannedWorkouts: plannedWorkoutResult.data.map(mapPlannedWorkoutFromDb),
        aos: aoResult.data.map(mapAoFromDb),
        qSlots: qSlotResult.data.map(mapQSlotFromDb),
    };
}

function mapMemberFromDb(row) {
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

function mapSessionFromDb(row) {
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
    };
}

function mapQSlotFromDb(row) {
    return {
        id: row.id,
        aoId: row.ao_id,
        date: row.date,
        qUserId: row.q_user_id || null,
        createdAt: row.created_at,
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
            },
        ])
        .select()
        .single();
    if (error) throw error;

    return mapSessionFromDb(data);
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
            },
        ])
        .select()
        .single();

    if (error) throw error;

    return mapPlannedWorkoutFromDb(data);
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
        })
        .eq("id", workout.id)
        .select()
        .single();

    console.log("updatePlannedWorkoutInCloud data:", data);
    console.log("updatePlannedWorkoutInCloud error:", error);

    if (error) throw error;

    return mapPlannedWorkoutFromDb(data);
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

export async function loadAllRegions() {
    const { data, error } = await supabase
        .from("regions")
        .select("*")
        .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function getRegionById(regionId) {
    const { data, error } = await supabase
        .from("regions")
        .select("*")
        .eq("id", regionId)
        .single()

    if (error) throw error;
    return data;
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