import { state } from "../modules/state.js";
import { saveState } from "../utils/storage.js";
import { replaceSessionVisitors } from "./sessionVisitorData.js";
import { buildSessionAnnouncementSnapshot } from "../utils/announcements.js";
import { getEffectiveWorkoutThirdF } from "../utils/thirdFContent.js";
import { loadThirdFDiscussions } from "./thirdFData.js";
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
    loadAdminFlags,
    saveSessionCommand,
    loadMembersByIds,
    rebuildMemberStatsForMembers,
    getAffectedMemberIdsFromSession
} from "./cloudData.js";
import { prepareSessionSaveCommand } from "../utils/sessionSaveCommand.js";


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
        sessionSearchTerm: state.sessionSearchTerm,
        sessionHistorySearchTerm: state.sessionHistorySearchTerm,
        rosterSearchTerm: state.rosterSearchTerm,
        showMyPlannedWorkoutsOnly: state.showMyPlannedWorkoutsOnly,
        customTemplates: state.customTemplates,
    });
}

async function persistPreparedFngMembers(command) {
    for (const fng of command.fngs || []) {
        if (!fng.realName && !fng.paxName) continue;

        if (fng.isNew) {
            const savedMember = await addMember(
                {
                    id: fng.memberId,
                    realName: fng.realName || "",
                    paxName: fng.paxName || null,
                    status: "active",
                    fngStatus: fng.paxName ? "named" : "unnamed",
                    firstPostDate: command.session.date || null,
                    inviterIds:
                        fng.inviterIds ||
                        (fng.invitedById
                            ? [fng.invitedById]
                            : []),
                    invitedById:
                        fng.invitedById ||
                        fng.inviterIds?.[0] ||
                        null,
                },
                {
                    deferInviterSave: true,
                }
            );

            fng.memberId = savedMember.id;
            fng.isNew = false;

            continue;
        }

        const existingMember = state.members.find(
            member => member.id === fng.memberId
        );

        if (!existingMember) continue;

        const nextPaxName = fng.paxName || null;
        const nextRealName = fng.realName || "";

        const nextInviterIds = Array.from(
            new Set(
                (
                    fng.inviterIds ||
                    (fng.invitedById
                        ? [fng.invitedById]
                        : [])
                ).filter(Boolean)
            )
        ).sort();
        
        const existingInviterIds = Array.from(
            new Set(
                (
                    existingMember.inviterIds ||
                    (existingMember.invitedById
                        ? [existingMember.invitedById]
                        : [])
                ).filter(Boolean)
            )
        ).sort();
        
        const memberChanged =
            existingMember.paxName !== nextPaxName ||
            existingMember.realName !== nextRealName;
        
        const invitersChanged =
            nextInviterIds.length !== existingInviterIds.length ||
            nextInviterIds.some(
                (id, index) => id !== existingInviterIds[index]
            );
        
        if (!memberChanged && !invitersChanged) continue;
        
        await updateMember(fng.memberId, {
            ...existingMember,
            paxName: nextPaxName,
            realName: nextRealName,
            fngStatus: nextPaxName ? "named" : "unnamed",
            inviterIds: nextInviterIds,
            invitedById: nextInviterIds[0] || null,
        });
    }
}

async function saveSessionFngInviters(session) {
    for (const fng of session.fngs || []) {
        if (!fng.memberId) continue;

        const inviterIds =
            fng.inviterIds ||
            (fng.invitedById
                ? [fng.invitedById]
                : []);

        await setMemberInviters(
            fng.memberId,
            inviterIds,
            {
                source: "session_fng",
                sourceMetadata: {
                    createdDuringSessionLogging: true,
                },
                sessionId: session.id,
            }
        );
    }
}

async function prepareSessionForInsert(
    session,
    activeRegionId
) {
    const announcementCandidates =
        await loadPlannerAnnouncements(activeRegionId);

    const thirdFCandidates =
        await loadThirdFDiscussions(activeRegionId);

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
            session.workout?.announcementMode === "custom" ||
            sourcePlannedWorkout?.announcementMode === "custom"
                ? "custom"
                : "auto",
        announcementText:
            session.workout?.announcementMode === "custom"
                ? session.workout?.announcementText || ""
                : sourcePlannedWorkout?.announcementMode === "custom"
                    ? sourcePlannedWorkout.announcementText || ""
                    : "",
    };

    const sessionAnnouncements =
        buildSessionAnnouncementSnapshot({
            workout: snapshotWorkout,
            announcements: announcementCandidates,
            regionId: activeRegionId,
        });

    const effectiveThirdF =
        getEffectiveWorkoutThirdF({
            workout: snapshotWorkout,
            thirdFItems: thirdFCandidates,
            targetDate: session.date,
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
                thirdFText:
                    effectiveThirdF.text,
            }
            : null,
    };
}

export async function addSession(session) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const command = prepareSessionSaveCommand(session);

    const preparedSession =
    await prepareSessionForInsert(
        command.session,
        activeRegionId
    );

    const attendeeIds =
        preparedSession.attendeeIds || [];

    const qIds =
        preparedSession.qIds ||
        (preparedSession.qId
            ? [preparedSession.qId]
            : []);

    const fngMemberIds = (command.fngs || [])
        .map(fng => fng.memberId)
        .filter(Boolean);

    console.group("SESSION COMMAND ATTENDEE DEBUG");

    console.log({
        activeRegionId,
        sessionId: preparedSession.id,
        sourcePlannedWorkoutId:
            preparedSession.sourcePlannedWorkoutId,
        qSlotId: preparedSession.qSlotId,
        attendeeIds,
        qIds,
        fngMemberIds,
    });

    console.table(
        attendeeIds.map(id => {
            const member = state.members.find(
                candidate => candidate.id === id
            );

            return {
                id,
                foundInState: Boolean(member),
                paxName: member?.paxName || "",
                realName: member?.realName || "",
                memberRegionId:
                    member?.regionId ||
                    member?.region_id ||
                    "",
                activeRegionId,
                isQ: qIds.includes(id),
                isFng: fngMemberIds.includes(id),
            };
        })
    );

    console.groupEnd();

    const result = await saveSessionCommand(
        activeRegionId,
        preparedSession,
        {
            mode: "create",
            fngs: command.fngs,
            visitors: command.visitors,
        }
    );

    const savedSession = result.session;

    try {
        await rebuildMemberStatsForMembers(
            activeRegionId,
            getAffectedMemberIdsFromSession(savedSession)
        );
    } catch (error) {
        console.warn(
            "Session saved, but member stats rebuild failed:",
            error
        );
    }
    
    const affectedMemberIds = command.fngs
        .map(fng => fng.memberId)
        .filter(Boolean);
    
    const refreshedMembers =
        await loadMembersByIds(
            activeRegionId,
            affectedMemberIds
        );
    
    mergeMembersIntoState(refreshedMembers);
    
    state.sessions.push(savedSession);
    persistAppData();
    
    return savedSession;
}

export async function updateSession(
    sessionId,
    updatedSession
) {
    const activeRegionId = state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    if (
        updatedSession.id &&
        updatedSession.id !== sessionId
    ) {
        throw new Error("Session id mismatch");
    }

    const existingSession =
        state.sessions.find(
            session => session.id === sessionId
        ) || null;

    const command = prepareSessionSaveCommand({
        ...updatedSession,
        id: sessionId,
    });

    const preparedSession =
        await prepareSessionForInsert(
            command.session,
            activeRegionId
        );

    const result = await saveSessionCommand(
        activeRegionId,
        preparedSession,
        {
            mode: "update",
            fngs: command.fngs,
            visitors: command.visitors,
        }
    );

    const savedSession = result.session;

    const affectedStatsMemberIds = [
        ...new Set([
            ...getAffectedMemberIdsFromSession(
                existingSession
            ),
            ...getAffectedMemberIdsFromSession(
                savedSession
            ),
        ]),
    ];

    try {
        await rebuildMemberStatsForMembers(
            activeRegionId,
            affectedStatsMemberIds
        );
    } catch (error) {
        console.warn(
            "Session saved, but member stats rebuild failed:",
            error
        );
    }

    const affectedFngMemberIds = command.fngs
        .map(fng => fng.memberId)
        .filter(Boolean);

    const refreshedMembers =
        await loadMembersByIds(
            activeRegionId,
            affectedFngMemberIds
        );

    mergeMembersIntoState(refreshedMembers);

    const index = state.sessions.findIndex(
        session => session.id === sessionId
    );

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

export async function addMember(
    member,
    {
        deferInviterSave = false,
        sessionId = null,
    } = {}
) {
    const activeRegionId = state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const inviterIds =
        member.inviterIds ||
        (member.invitedById
            ? [member.invitedById]
            : []);

    const savedMember = await insertMember(
        activeRegionId,
        member
    );

    /*
     * New FNGs are created before their session exists.
     * Their inviter relationships must be saved after the
     * session has been inserted.
     */
    if (!deferInviterSave) {
        await setMemberInviters(
            savedMember.id,
            inviterIds,
            {
                sessionId,
            }
        );
    }

    savedMember.inviterIds = inviterIds;
    savedMember.invitedById =
        inviterIds[0] || null;

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
    state.adminFlags = [];
    state.hasLoadedAdminFlags = false;
    state.isLoadingAdminFlags = false;
    state.adminFlagsLoadError = null;
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

export async function ensureAdminFlagsLoaded({
    force = false,
} = {}) {
    const activeRegionId = state.currentRegionId;

    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    if (
        state.hasLoadedAdminFlags &&
        !force
    ) {
        return state.adminFlags;
    }

    if (state.isLoadingAdminFlags) {
        return state.adminFlags;
    }

    state.isLoadingAdminFlags = true;
    state.adminFlagsLoadError = null;

    try {
        const flags = await loadAdminFlags(
            activeRegionId,
            {
                status: "open",
                limit: 100,
            }
        );

        /*
         * The active region may have changed while the request
         * was running. Do not put one region's flags into another
         * region's state.
         */
        if (state.currentRegionId !== activeRegionId) {
            return [];
        }

        state.adminFlags = flags;
        state.hasLoadedAdminFlags = true;

        return flags;
    } catch (error) {
        if (state.currentRegionId === activeRegionId) {
            state.adminFlagsLoadError =
                error?.message ||
                "Failed to load admin flags.";
        }

        throw error;
    } finally {
        if (state.currentRegionId === activeRegionId) {
            state.isLoadingAdminFlags = false;
        }
    }
}

export async function addAdminFlags(flags) {
    if (!Array.isArray(flags) || flags.length === 0) return [];

    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const savedFlags = await insertAdminFlags(activeRegionId, flags);

    state.adminFlags.push(...savedFlags);
    state.hasLoadedAdminFlags = true;
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

function mergeMembersIntoState(members = []) {
    members.forEach(savedMember => {
        const index = state.members.findIndex(
            member => member.id === savedMember.id
        );

        if (index === -1) {
            state.members.push(savedMember);
            return;
        }

        state.members[index] = savedMember;
    });
}