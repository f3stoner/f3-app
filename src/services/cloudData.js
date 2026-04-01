import { supabase } from "./supabaseClient.js";

export async function loadRegionData(regionId) {
    const [
        regionResult,
        memberResult,
        sessionResult,
        plannedWorkoutResult,
    ] = await Promise.all([
        supabase
            .from("regions")
            .select("*")
            .eq("id", regionId)
            .single(),

        supabase
            .from("members")
            .select("*")
            .eq("region_id", regionId),

        supabase
            .from("sessions")
            .select("*")
            .eq("region_id", regionId),

        supabase
            .from("planned_workouts")
            .select("*")
            .eq("region_id", regionId),
    ]);

    if (regionResult.error) throw regionResult.error;
    if (memberResult.error) throw memberResult.error;
    if (sessionResult.error) throw sessionResult.error;
    if (plannedWorkoutResult.error) throw plannedWorkoutResult.error;

    return {
        regionName: regionResult.data.name,
        members: memberResult.data.map(mapMemberFromDb),
        sessions: sessionResult.data.map(mapSessionFromDb),
        plannedWorkouts: plannedWorkoutResult.data.map(mapPlannedWorkoutFromDb),
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
        qId: row.q_id,
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
                q_id: session.qId || null,
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
            q_id: session.qId || null,
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
    const { data, error } = await supabase
        .from("planned_workouts")
        .update({
            region_id: regionId,
            date: workout.date,
            ao_name: workout.aoName,
            title: workout.title || "",
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
    
    if (error) throw error;

    return mapPlannedWorkoutFromDb(data);
}

export async function insertSessionsBatch(regionId, sessions) {
    const payload = sessions.map(session => ({
        id: session.id,
        region_id: regionId,
        date: session.date,
        ao_name: session.aoName,
        q_id: session.qId || null,
        attendee_ids: session.attendeeIds || [],
        fngs: session.fngs || [],
        notes: session.notes || "",
        workout: session.workout || null,
        source_planned_workout_id: session.sourcePlannedWorkoutId || null,
        created_at: session.createdAt,
    }));

    const { data, error } = await supabase
        .from("sessions")
        .insert(payload)
        .select()

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