import { state } from "../modules/state.js";

export const PERMISSIONS = {
    VIEW_AO_INSIGHTS: "view_ao_insights",
    VIEW_REGION_INSIGHTS: "view_region_insights",
    VIEW_SESSION_AUDIT: "view_session_audit",
    VIEW_PAX_OVERVIEW: "view_pax_overview",

    MANAGE_AOS: "manage_aos",
    MANAGE_Q_SLOTS: "manage_q_slots",
    MANAGE_MEMBERS: "manage_members",
    MANAGE_WORKOUTS: "manage_workouts",
    MANAGE_SESSIONS: "manage_sessions",
    MANAGE_ANNOUNCEMENTS: "manage_announcements",
    MANAGE_Q_SOURCE: "manage_q_source",
    MANAGE_LIBRARY_WORKBENCH: "manage_library_workbench",
    MANAGE_ROLES: "manage_roles",

    EDIT_AO_SESSIONS: "edit_ao_sessions",

    VIEW_TELEMETRY: "view_telemetry",
    VIEW_IMPORTS: "view_imports",
    RUN_IMPORTS: "run_imports",

    VIEW_Q_READINESS: "view_q_readiness",

    ACCESS_DEBUG_TOOLS: "access_debug_tools",
    ACCESS_ADMIN_SETTINGS: "access_admin_settings",
    ACCESS_OPERATIONS_CENTER: "access_operations_center",
    ACCESS_EMERGENCY_CONTACT_LOOKUP: "access_emergency_contact_lookup",
};

export const ROLE_PERMISSIONS = {
    pax: [],

    aoq: [
        PERMISSIONS.VIEW_AO_INSIGHTS,
        PERMISSIONS.MANAGE_Q_SLOTS,
        PERMISSIONS.VIEW_PAX_OVERVIEW,
    ],

    slt: [
        PERMISSIONS.VIEW_AO_INSIGHTS,
        PERMISSIONS.VIEW_REGION_INSIGHTS,
        PERMISSIONS.VIEW_PAX_OVERVIEW,
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
        //PERMISSIONS.VIEW_IMPORTS,
        //PERMISSIONS.RUN_IMPORTS,
        PERMISSIONS.ACCESS_ADMIN_SETTINGS,
        PERMISSIONS.MANAGE_MEMBERS,
        PERMISSIONS.MANAGE_LIBRARY_WORKBENCH,
        PERMISSIONS.VIEW_SESSION_AUDIT,
        PERMISSIONS.VIEW_PAX_OVERVIEW,
    ],

    superadmin: Object.values(PERMISSIONS),
};

const AO_LEADERSHIP_POSITIONS = ["aoq", "ao_coq", "ao_data_q"];
const AO_INSIGHTS_POSITIONS = ["aoq", "ao_coq", "first_f", "second_f", "third_f", "ao_data_q"];
const AO_Q_READINESS_POSITIONS = ["aoq", "ao_coq", "first_f"];
const AO_SESSION_EDIT_POSITIONS = ["aoq", "ao_coq", "ao_data_q"];
const AO_MEMBER_MANAGEMENT_POSITIONS = ["aoq", "ao_coq", "ao_data_q"];
const AO_SESSION_AUDIT_POSITIONS = ["aoq", "ao_coq", "ao_data_q"];

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

export function getManagedAoIds(positions = AO_LEADERSHIP_POSITIONS) {
    return [
        ...new Set(
            getScopedAoPermissionRows(positions)
                .map(row => row.aoId)
                .filter(Boolean)
        ),
    ];
}

export function managesAo(aoId, positions = AO_LEADERSHIP_POSITIONS) {
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
    return managesAo(aoId, AO_INSIGHTS_POSITIONS);
}

export function canViewQReadiness(aoId) {
    return managesAo(aoId, AO_Q_READINESS_POSITIONS);
}

export function canEditAoSession(aoId) {
    return managesAo(aoId, AO_SESSION_EDIT_POSITIONS);
}

export function isCurrentUserSessionQ(session) {
    if (!session || !state.currentUserMemberId) {
        return false;
    }

    const qIds = Array.isArray(session.qIds)
        ? session.qIds
        : Array.isArray(session.q_ids)
            ? session.q_ids
            : [];

    if (qIds.length > 0) {
        return qIds.includes(state.currentUserMemberId);
    }

    const legacyQId = session.qId || session.q_id || null;

    return legacyQId === state.currentUserMemberId;
}

export function canManageSession(session) {
    if (!session) {
        return false;
    }

    const createdByUserId =
        session.createdByUserId
        || session.created_by_user_id
        || null;

    const aoId =
        session.aoId
        || session.ao_id
        || null;

    return createdByUserId === state.currentUserId
        || isCurrentUserSessionQ(session)
        || isRegionalAdmin()
        || canEditAoSession(aoId);
}

export function canViewAnyAoInsights() {
    return hasPermission(PERMISSIONS.VIEW_AO_INSIGHTS)
        || getManagedAoIds(AO_INSIGHTS_POSITIONS).length > 0;
}

export function canViewAnyQReadiness() {
    return hasPermission(PERMISSIONS.VIEW_Q_READINESS)
        || getManagedAoIds(AO_Q_READINESS_POSITIONS).length > 0;
}

export function canEditAnySessions() {
    return hasPermission(PERMISSIONS.MANAGE_SESSIONS)
        || getManagedAoIds(AO_SESSION_EDIT_POSITIONS).length > 0;
}

export function canUseFloatingLogButton() {
    return isSuperAdmin()
        || isDataQ()
        || getManagedAoIds(["aoq", "ao_coq", "ao_data_q"]).length > 0;
}

export function canManageAoMembers(aoId) {
    return managesAo(aoId, AO_MEMBER_MANAGEMENT_POSITIONS);
}

export function canViewSessionAudit(aoId) {
    return hasPermission(PERMISSIONS.VIEW_SESSION_AUDIT)
        || managesAo(aoId, AO_SESSION_AUDIT_POSITIONS);
}

export function canViewAnySessionAudit() {
    return hasPermission(PERMISSIONS.VIEW_SESSION_AUDIT)
        || getManagedAoIds(AO_SESSION_AUDIT_POSITIONS).length > 0;
}

export function canViewPaxOverview(memberId) {
    if (!memberId) return false;

    if (memberId === state.currentUserMemberId) {
        return true;
    }

    if (hasPermission(PERMISSIONS.VIEW_PAX_OVERVIEW)) {
        return true;
    }

    return getManagedAoIds(AO_LEADERSHIP_POSITIONS).length > 0;
}

export function shouldShowAuditLogFab() {
    return state.currentUserId === "1cb38626-0058-45de-8e07-52ac0d19fa71";
}

export function canManageCurrentRoster() {
    if (isSuperAdmin()) {
        return true;
    }

    if (!isDataQ() && !isRegionalSLT()) {
        return false;
    }

    const homeRegionId =
        state.homeRegionId ||
        state.profileRegionId ||
        null;

    return Boolean(
        homeRegionId &&
        state.currentRegionId &&
        homeRegionId === state.currentRegionId
    );
}