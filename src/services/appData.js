import { state } from "../modules/state.js";
import { saveState } from "../utils/storage.js";
import { replaceSessionVisitors } from "./sessionVisitorData.js";
import { buildSessionAnnouncementSnapshot } from "../utils/announcements.js";
import {
    deletePlannedWorkoutFromCloud,
    deleteSavedPlannerSectionFromCloud,
    deleteSessionFromCloud,
    insertAdminFlags,
    insertMember,
    insertPlannedWorkout,
    insertSavedPlannerSection,
    insertSession,
    loadPlannerAnnouncements,
    setMemberInviters,
    updateAdminFlagInCloud,
    updateMemberInCloud,
    updatePlannedWorkoutInCloud,
    updateSavedPlannerSectionInCloud,
    updateSessionInCloud,
} from "./cloudData.js";

export function persistAppData() {
    saveState({
        currentUserId: state.currentUserId,
        currentUserRole: state.currentUserRole,
        currentUserDisplayName: state.currentUserDisplayName,
        currentView: state.currentView,
        selectedMemberId: state.selectedMemberId,
        selectedSessionId: state.selectedSessionId,
        selectedPlannedWorkoutId: state.selectedPlannedWorkoutId,
        editingMemberId: state.editingMemberId,
        editingSessionId: state.editingSessionId,
        editingPlannedWorkoutId: state.editingPlannedWorkoutId,
        sessionSearchTerm: state.sessionSearchTerm,
        sessionHistorySearchTerm: state.sessionHistorySearchTerm,
        rosterSearchTerm: state.rosterSearchTerm,
        showMyPlannedWorkoutsOnly: state.showMyPlannedWorkoutsOnly,
        customTemplates: state.customTemplates,
        adminFlags: state.adminFlags,
    });
}

function normalizeId(id) {
    return String(id || "").trim();
}

function normalizeSessionForSave(session) {
    const qIds = [...new Set(session.qIds || (session.qId ? [session.qId] : []))]
        .map(normalizeId)
        .filter(Boolean);

    const fngMemberIds = (session.fngs || [])
        .map(fng => normalizeId(fng.memberId))
        .filter(Boolean);

    const attendeeIds = [
        ...new Set([
            ...(session.attendeeIds || []).map(normalizeId),
            ...qIds,
            ...fngMemberIds,
        ]),
    ].filter(Boolean);

    return {
        ...session,
        id: session.id || crypto.randomUUID(),
        qIds,
        attendeeIds,
        fngs: session.fngs || [],
        visitors: session.visitors || [],
        notes: session.notes || "",
        workout: session.workout || null,
        backblastText: session.backblastText || "",
        createdAt: session.createdAt || Date.now(),
        createdByUserId: session.createdByUserId || state.currentUserId,
    };
}

async function ensureFngMembersForSession(activeRegionId, session) {
    const fngs = [];

    for (const fng of session.fngs || []) {
        if (!fng.realName && !fng.paxName) continue;

        if (fng.memberId) {
            fngs.push(fng);
            continue;
        }

        const savedMember = await addMember({
            id: crypto.randomUUID(),
            realName: fng.realName || "",
            paxName: fng.paxName || null,
            status: "active",
            fngStatus: fng.paxName ? "named" : "unnamed",
            firstPostDate: session.date || null,
            inviterIds:
                fng.inviterIds ||
                (fng.invitedById
                    ? [fng.invitedById]
                    : []),
            invitedById:
                fng.invitedById ||
                fng.inviterIds?.[0] ||
                null,
        });

        fngs.push({
            ...fng,
            memberId: savedMember.id,
            inviterIds: savedMember.inviterIds || [],
            invitedById: savedMember.invitedById || null,
        });
    }

    const fngMemberIds = fngs
        .map(fng => normalizeId(fng.memberId))
        .filter(Boolean);

    return normalizeSessionForSave({
        ...session,
        fngs,
        attendeeIds: [
            ...(session.attendeeIds || []),
            ...fngMemberIds,
        ],
    });
}

async function prepareSessionForInsert(
    session,
    activeRegionId
) {
    const announcementCandidates =
        await loadPlannerAnnouncements(activeRegionId);

    const sourcePlannedWorkout =
        session.sourcePlannedWorkoutId
            ? (state.plannedWorkouts || []).find(
                workout =>
                    workout.id ===
                    session.sourcePlannedWorkoutId
            ) || null
            : null;

    /*
     * Prefer the authoritative planned-workout record because it
     * contains announcementMode and any persisted custom text.
     *
     * Dashboard paths may attach a full planned workout directly to
     * session.workout, so use that next.
     *
     * Manual and Q-slot sessions receive a synthetic auto workout
     * resolved from the final session date and AO.
     */
    const snapshotWorkout = {
        ...(sourcePlannedWorkout || {}),
        ...(session.workout || {}),
        id:
            session.sourcePlannedWorkoutId ||
            session.workout?.id ||
            null,
        regionId: activeRegionId,
        date: session.date,
        aoId: session.aoId || null,
        aoName: session.aoName || "",
        announcementMode:
            session.workout?.announcementMode === "custom"
                ? "custom"
                : "auto",
        announcementText:
            session.workout?.announcementMode === "custom"
                ? session.workout?.announcementText || ""
                : "",
    };

    const sessionAnnouncements =
        buildSessionAnnouncementSnapshot({
            workout: snapshotWorkout,
            announcements: announcementCandidates,
            regionId: activeRegionId,
        });

    return {
        ...session,
        announcementText: sessionAnnouncements.text,
        announcementSnapshot:
            sessionAnnouncements.snapshot,
        workout: session.workout
            ? {
                ...session.workout,
                announcementText:
                    sessionAnnouncements.text,
            }
            : null,
    };
}

export async function addSession(session) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const normalizedSession =
        await ensureFngMembersForSession(
            activeRegionId,
            session
        );

    const preparedSession =
        await prepareSessionForInsert(
            normalizedSession,
            activeRegionId
        );

    console.log("addSession RLS debug", {
        activeRegionId: state.currentRegionId,
        currentUserId: state.currentUserId,
        profileRegionId: state.profileRegionId,
        regionName: state.regionName,
    });

    const savedSession = await insertSession(
        activeRegionId,
        preparedSession
    );

    await replaceSessionVisitors(
        savedSession.id,
        normalizedSession.visitors || [],
        state.currentUserId
    );
    
    savedSession.visitors = normalizedSession.visitors || [];
    state.sessions.push(savedSession);
    persistAppData();
    return savedSession;
}

export async function updateSession(sessionId, updatedSession) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const normalizedSession = await ensureFngMembersForSession(
        activeRegionId,
        updatedSession
    );
    
    const savedSession = await updateSessionInCloud(
        activeRegionId,
        normalizedSession
    );

    await replaceSessionVisitors(
        savedSession.id,
        normalizedSession.visitors || [],
        state.currentUserId
    );
    
    savedSession.visitors = normalizedSession.visitors || [];
    
    const index = state.sessions.findIndex(session => session.id === sessionId);
    if (index === -1) return false;

    state.sessions[index] = savedSession;
    persistAppData();
    return true;
}

export async function deleteSession(sessionId) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    await deleteSessionFromCloud(activeRegionId, sessionId);

    state.sessions = state.sessions.filter(
        session => session.id !== sessionId
    );

    persistAppData();
}

export async function addPlannedWorkout(workout) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const savedWorkout = await insertPlannedWorkout(activeRegionId, workout);
    state.plannedWorkouts.push(savedWorkout);
    persistAppData();
    return savedWorkout;
}

export async function updatePlannedWorkout(workoutId, updatedWorkout) {
    console.log("updatePlannedWorkout workoutId:", workoutId);
    console.log("updatePlannedWorkout updatedWorkout:", updatedWorkout);
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const savedWorkout = await updatePlannedWorkoutInCloud(activeRegionId, updatedWorkout);
    const index = state.plannedWorkouts.findIndex(workout => workout.id === workoutId);
    if (index === -1) return false;

    state.plannedWorkouts[index] = savedWorkout;
    persistAppData();
    return true;
}

export async function deletePlannedWorkout(workoutId) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    await deletePlannedWorkoutFromCloud(activeRegionId, workoutId);

    state.plannedWorkouts = state.plannedWorkouts.filter(
        workout => workout.id !== workoutId
    );

    persistAppData();
}

export async function addMember(member) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const savedMember = await insertMember(activeRegionId, member);

    await setMemberInviters(
        savedMember.id,
        member.inviterIds || (
            member.invitedById
                ? [member.invitedById]
                : []
        )
    );

    savedMember.inviterIds =
        member.inviterIds ||
        (member.invitedById ? [member.invitedById] : []);

    savedMember.invitedById =
        savedMember.inviterIds[0] || null;

    state.members.push(savedMember);

    persistAppData();
    return savedMember;
}

export async function updateMember(memberId, updatedMember) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const savedMember = await updateMemberInCloud(
        activeRegionId,
        updatedMember
    );
    
    await setMemberInviters(
        memberId,
        updatedMember.inviterIds || (
            updatedMember.invitedById
                ? [updatedMember.invitedById]
                : []
        )
    );
    
    savedMember.inviterIds =
        updatedMember.inviterIds ||
        (updatedMember.invitedById
            ? [updatedMember.invitedById]
            : []);
    
    savedMember.invitedById =
        savedMember.inviterIds[0] || null;
    
    const index = state.members.findIndex(
        member => member.id === memberId
    );
    
    if (index === -1) return false;
    
    state.members[index] = savedMember;
    
    persistAppData();
    
    return true;
}

export function removeMemberFromState(memberId) {
    state.members = state.members.filter(member => member.id !== memberId);
    persistAppData();
}

export function replacePersistedData({
    regionName,
    members,
    sessions,
    plannedWorkouts,
    aos,
    sites,
    qSlots,
    adminFlags,
    savedPlannerSections,
    workoutFieldLabels,
    announcements,
    qSources,
    memberStats,
    memberStatsByMemberId,
    fngNamingPostNumber,
    aoLeadershipContacts,
}) {
    state.regionName = regionName;
    state.fngNamingPostNumber = fngNamingPostNumber || 1;
    state.members = members;
    state.sessions = sessions;
    state.plannedWorkouts = plannedWorkouts;
    state.aos = aos || [];
    state.sites = sites || [];
    state.qSlots = qSlots || [];
    state.adminFlags = adminFlags || [];
    state.savedPlannerSections = savedPlannerSections || [];
    state.workoutFieldLabels = workoutFieldLabels || {};
    state.announcements = announcements || [];
    state.qSources = qSources || [];

    state.memberStats = memberStats = memberStats || [];
    state.memberStatsByMemberId = memberStatsByMemberId || {};
    state.aoLeadershipContacts = aoLeadershipContacts || [];

    state.allAnnouncements = null;
    state.hasLoadedAllAnnouncements = false;
    state.isLoadingAllAnnouncements = false;

    state.allQSources = null;
    state.hasLoadedAllQSources = false;
    state.isLoadingAllQSources = false;

    state.selectedMemberId = null;
    state.selectedAoId = null;
    state.editingAoId = null;
    state.selectedPreblastWorkoutId = null;
}

export async function addAdminFlags(flags) {
    if (!Array.isArray(flags) || flags.length === 0) return [];

    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const savedFlags = await insertAdminFlags(activeRegionId, flags);

    state.adminFlags.push(...savedFlags);
    persistAppData();

    return savedFlags;
}

export async function updateAdminFlag(flagId, updates) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const existingFlag = state.adminFlags.find(flag => flag.id === flagId);
    if (!existingFlag) return false;

    const updatedFlag = {
        ...existingFlag,
        ...updates,
    };

    const savedFlag = await updateAdminFlagInCloud(activeRegionId, updatedFlag);

    const index = state.adminFlags.findIndex(flag => flag.id === flagId);
    if (index === -1) return false;

    state.adminFlags[index] = savedFlag;
    persistAppData();

    return true;
}

export async function setMemberStatus(memberId, status) {
    const member = state.members.find(member => member.id === memberId);
    if (!member) throw new Error("Member not found");

    const updatedMember = {
        ...member,
        status,
    };

    await updateMember(memberId, updatedMember);
}

export async function addSavedPlannerSection(section) {
    const activeRegionId = state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const savedSection = await insertSavedPlannerSection(state.currentRegionId, section);

    state.savedPlannerSections = [
        savedSection,
        ...(state.savedPlannerSections || []),
    ];

    persistAppData();

    return savedSection;
}

export async function updateSavedPlannerSection(section) {
    const activeRegionId = state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const savedSection = await updateSavedPlannerSectionInCloud(
        state.currentRegionId,
        section
    );

    state.savedPlannerSections = (state.savedPlannerSections || []).map(existing =>
        existing.id === savedSection.id ? savedSection : existing
    );

    persistAppData();

    return savedSection;
}

export async function deleteSavedPlannerSection(sectionId) {
    const activeRegionId = state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    await deleteSavedPlannerSectionFromCloud(activeRegionId, sectionId);

    state.savedPlannerSections = (state.savedPlannerSections || []).filter(
        section => section.id !== sectionId
    );

    persistAppData();
}