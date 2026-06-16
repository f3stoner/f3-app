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
    ],

    dataq: [
        PERMISSIONS.VIEW_AO_INSIGHTS,
        PERMISSIONS.VIEW_REGION_INSIGHTS,
        PERMISSIONS.VIEW_TELEMETRY,
        PERMISSIONS.VIEW_IMPORTS,
        PERMISSIONS.RUN_IMPORTS,
        PERMISSIONS.ACCESS_ADMIN_SETTINGS,
        PERMISSIONS.MANAGE_MEMBERS,
    ],

    superadmin: Object.values(PERMISSIONS),
};

export function hasPermission(permission) {
    const role = state.currentUserRole || "pax";

    const permissions = ROLE_PERMISSIONS[role] || [];

    return permissions.includes(permission);
}