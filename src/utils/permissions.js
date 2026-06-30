import { state } from "../modules/state.js";

export const PERMISSIONS = {
    VIEW_AO_INSIGHTS: "view_ao_insights",
    VIEW_REGION_INSIGHTS: "view_region_insights",

    MANAGE_AOS: "manage_aos",
    MANAGE_Q_SLOTS: "manage_q_slots",
    MANAGE_MEMBERS: "manage_members",
    MANAGE_WORKOUTS: "manage_workouts",
    MANAGE_SESSIONS: "manage_sessions",
    MANAGE_ANNOUNCEMENTS: "manage_announcements",
    MANAGE_Q_SOURCE: "manage_q_source",
    MANAGE_LIBRARY_WORKBENCH: "manage_library_workbench",
    MANAGE_ROLES: "manage_roles",

    VIEW_TELEMETRY: "view_telemetry",
    VIEW_IMPORTS: "view_imports",
    RUN_IMPORTS: "run_imports",

    VIEW_Q_READINESS: "view_q_readiness",

    ACCESS_DEBUG_TOOLS: "access_debug_tools",
    ACCESS_ADMIN_SETTINGS: "access_admin_settings",
};

export const ROLE_PERMISSIONS = {
    pax: [],

    aoq: [
        PERMISSIONS.VIEW_AO_INSIGHTS,
        PERMISSIONS.MANAGE_Q_SLOTS,
    ],

    slt: [
        PERMISSIONS.VIEW_AO_INSIGHTS,
        PERMISSIONS.VIEW_REGION_INSIGHTS,
        PERMISSIONS.MANAGE_AOS,
        PERMISSIONS.MANAGE_Q_SLOTS,
        PERMISSIONS.ACCESS_ADMIN_SETTINGS,
        PERMISSIONS.MANAGE_MEMBERS,
        PERMISSIONS.MANAGE_ANNOUNCEMENTS,
        PERMISSIONS.VIEW_Q_READINESS,
        PERMISSIONS.MANAGE_Q_SOURCE,
        PERMISSIONS.MANAGE_LIBRARY_WORKBENCH
    ],

    dataq: [
        PERMISSIONS.VIEW_AO_INSIGHTS,
        PERMISSIONS.VIEW_REGION_INSIGHTS,
        PERMISSIONS.VIEW_TELEMETRY,
        PERMISSIONS.VIEW_IMPORTS,
        PERMISSIONS.RUN_IMPORTS,
        PERMISSIONS.ACCESS_ADMIN_SETTINGS,
        PERMISSIONS.MANAGE_MEMBERS,
        PERMISSIONS.MANAGE_LIBRARY_WORKBENCH,
    ],

    superadmin: Object.values(PERMISSIONS),
};

export function hasPermission(permission) {
    const role = state.currentUserRole || "pax";

    const permissions = ROLE_PERMISSIONS[role] || [];

    return permissions.includes(permission);
}

export function isSuperAdmin() {
    return state.currentUserRole === "superadmin";
}

export function isDataQ() {
    return state.currentUserRole === "dataq";
}

export function isRegionalSLT() {
    return state.currentUserRole === "slt";
}

export function isRegionalAdmin() {
    return isSuperAdmin() || isDataQ() || isRegionalSLT();
}

function normalizeAoPermissionRow(row) {
    return {
        profileId: row.profileId || row.profile_id,
        regionId: row.regionId || row.region_id,
        aoId: row.aoId || row.ao_id,
        position: row.position,
    };
}

export function getAoLeadershipAssignments() {
    return (state.profileAoPermissions || []).map(normalizeAoPermissionRow);
}

export function getCurrentProfileId() {
    return state.currentUserProfileId || state.currentUserId || null;
}

export function getScopedAoPermissionRows(positions = []) {
    const currentProfileId = getCurrentProfileId();
    const currentRegionId = state.currentRegionId;

    if (!currentProfileId || !currentRegionId) return [];

    return getAoLeadershipAssignments().filter(row => {
        const matchesProfile = row.profileId === currentProfileId;
        const matchesRegion = row.regionId === currentRegionId;
        const matchesPosition = positions.length === 0 || positions.includes(row.position);

        return matchesProfile && matchesRegion && matchesPosition;
    });
}

export function getManagedAoIds(positions = ["aoq", "ao_coq"]) {
    return [
        ...new Set(
            getScopedAoPermissionRows(positions)
                .map(row => row.aoId)
                .filter(Boolean)
        ),
    ];
}

export function managesAo(aoId, positions = ["aoq", "ao_coq"]) {
    if (isRegionalAdmin()) return true;
    if (!aoId) return false;

    return getManagedAoIds(positions).includes(aoId);
}

export function managesQSlot(slotOrAoId) {
    const aoId = typeof slotOrAoId === "object"
        ? slotOrAoId?.aoId || slotOrAoId?.ao_id
        : slotOrAoId;

    return managesAo(aoId);
}

export function canViewAoInsights(aoId) {
    return managesAo(aoId, ["aoq", "ao_coq", "first_f_q"]);
}

export function canViewQReadiness(aoId) {
    return managesAo(aoId, ["aoq", "ao_coq", "first_f_q"]);
}