import { supabase } from '../supabaseClient';

export async function loadProductionSnapshot(regionId) {
    if (!regionId) {
        throw new Error("Region ID is required.");
    }

    const [
        membersResult,
        sessionsResult,
    ] = await Promise.all([
        supabase
            .from('members')
            .select(`
                id,
                pax_name,
                real_name,
                home_ao,
                first_post_date,
                status
            `)
            .eq('region_id', regionId),
    
        supabase
            .from('sessions')
            .select(`
                id,
                date,
                ao_id,
                ao_name,
                attendee_ids,
                q_ids,
                fngs,
                unresolved_pax,
                site_id,
                start_time,
                source_q_slot_id,
                source_planned_workout_id
            `)
            .eq('region_id', regionId),
    ]);
    
    if (membersResult.error) throw membersResult.error;
    if (sessionsResult.error) throw sessionsResult.error;

    const memberIds = membersResult.data?.map((m) => m.id) ?? [];
    const sessionIds = sessionsResult.data?.map((s) => s.id) ?? [];

    let invitersResult = { data: [], error: null };
    let visitorsResult = { data: [], error: null };

    if (memberIds.length || sessionIds.length) {
        [
            invitersResult,
            visitorsResult,
        ] = await Promise.all([
            memberIds.length
                ? supabase
                    .from('member_inviters')
                    .select(`
                        member_id,
                        inviter_member_id
                    `)
                    .in('member_id', memberIds)
                : Promise.resolve({ data: [], error: null }),

            sessionIds.length
                ? supabase
                    .from('session_visitors')
                    .select(`
                        session_id,
                        visitor_name,
                        member_id
                    `)
                    .in('session_id', sessionIds)
                : Promise.resolve({ data: [], error: null }),
        ]);
    }
    
    if (invitersResult.error) throw invitersResult.error;
    if (visitorsResult.error) throw visitorsResult.error;

    return {
        regionId,
    
        members: membersResult.data,
    
        sessions: sessionsResult.data,
    
        memberInviters: invitersResult.data,
    
        sessionVisitors: visitorsResult.data,
    };
}