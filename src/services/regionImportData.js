import { supabase } from "./supabaseClient.js";

export async function loadRegionImportProjects() {
    const { data, error } = await supabase
        .from("region_import_projects")
        .select(`
            id,
            region_id,
            name,
            source_system,
            status,
            expected_member_count,
            expected_session_count,
            created_at,
            updated_at,
            completed_at,
            activated_at,
            regions (
                id,
                name
            )
        `)
        .order("created_at", {
            ascending: false,
        });

    if (error) throw error;

    return (data || []).map(project => ({
        id: project.id,
        regionId: project.region_id,
        regionName: project.regions?.name || "Unknown Region",
        name: project.name,
        sourceSystem: project.source_system,
        status: project.status,
        expectedMemberCount: project.expected_member_count,
        expectedSessionCount: project.expected_session_count,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        completedAt: project.completed_at,
        activatedAt: project.activated_at,
    }));
}

export async function loadRegionImportProjectSummary(projectId) {
    const { data, error } = await supabase.rpc(
        "load_region_import_project_summary",
        {
            p_project_id: projectId,
        }
    );

    if (error) throw error;

    return data;
}

export async function loadRegionImportIdentityReview(projectId) {
    const { data, error } = await supabase.rpc(
        "load_region_import_identity_review",
        {
            p_project_id: projectId,
        }
    );

    if (error) throw error;

    return data || [];
}

export async function resolveRegionImportIdentity({
    sourceIdentityId,
    resolutionType,
    canonicalMemberId = null,
    notes = null,
}) {
    const { data, error } = await supabase.rpc(
        "resolve_region_import_identity",
        {
            p_source_identity_id: sourceIdentityId,
            p_resolution_type: resolutionType,
            p_canonical_member_id: canonicalMemberId,
            p_notes: notes,
        }
    );

    if (error) throw error;

    return data;
}

export async function commitRegionImportIdentities(projectId) {
    const { data, error } = await supabase.rpc(
        "commit_region_import_identities",
        {
            p_project_id: projectId,
        }
    );

    if (error) throw error;

    return data;
}

export async function createRegionImportIdentityMergeDraft(
    sourceIdentityId
) {
    const { data, error } = await supabase.rpc(
        "create_region_import_identity_merge_draft",
        {
            p_source_identity_id: sourceIdentityId,
        }
    );

    if (error) throw error;

    return data;
}

export async function loadRegionImportStructureReview(projectId) {
    const { data, error } = await supabase.rpc("load_region_import_structure_review", {
        p_project_id: projectId,
    });

    if (error) throw error;

    return data || {
        sites: [],
        aos: [],
        schedules: [],
    };
}

export async function reviewRegionImportStructure(projectId) {
    const { data, error } = await supabase.rpc("review_region_import_structure", {
        p_project_id: projectId,
    });

    if (error) throw error;

    return data;
}

export async function commitRegionImportStructure(projectId) {
    const { data, error } = await supabase.rpc("commit_region_import_structure", {
        p_project_id: projectId,
    });

    if (error) throw error;

    return data;
}

export async function loadRegionImportSessionReview(projectId) {
    const { data, error } = await supabase.rpc("load_region_import_session_review", {
        p_project_id: projectId,
    });

    if (error) throw error;

    return data || {
        sessions: [],
    };
}

export async function reviewRegionImportSessions(projectId) {
    const { data, error } = await supabase.rpc("review_region_import_sessions", {
        p_project_id: projectId,
    });

    if (error) throw error;

    return data;
}

export async function commitRegionImportSessions(projectId) {
    const { data, error } = await supabase.rpc("commit_region_import_sessions", {
        p_project_id: projectId,
    });

    if (error) throw error;

    return data;
}

export async function resolveRegionImportSessionDuplicate(
    stagedSessionId,
    resolutionType
) {
    const { data, error } = await supabase.rpc(
        "resolve_region_import_session_duplicate",
        {
            p_staged_session_id: stagedSessionId,
            p_resolution_type: resolutionType,
        }
    );

    if (error) throw error;

    return data;
}