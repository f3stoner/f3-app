import { state } from "../modules/state.js";
import { saveState } from "../utils/storage.js";
import { insertAdminFlags, insertMember, updateMemberInCloud, updateAdminFlagInCloud } from "./cloudData.js";
import { insertSession, updateSessionInCloud, deleteSessionFromCloud } from "./cloudData.js";
import { insertPlannedWorkout, updatePlannedWorkoutInCloud, deletePlannedWorkoutFromCloud } from "./cloudData.js";

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

export async function addSession(session) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    console.log("addSession RLS debug", {
        activeRegionId: state.currentRegionId,
        currentUserId: state.currentUserId,
        profileRegionId: state.profileRegionId,
        regionName: state.regionName,
    });

    const savedSession = await insertSession(activeRegionId, session)
    state.sessions.push(savedSession);
    persistAppData();
    return savedSession;
}

export async function updateSession(sessionId, updatedSession) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const savedSession = await updateSessionInCloud(activeRegionId, updatedSession);
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
    state.members.push(savedMember);
    persistAppData();
    return savedMember;
}

export async function updateMember(memberId, updatedMember) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }
    const savedMember = await updateMemberInCloud(activeRegionId, updatedMember);
    const index = state.members.findIndex(member => member.id === memberId);
    if (index === -1) return false;

    state.members[index] = savedMember;
    persistAppData();
    return true;
}

export function removeMemberFromState(memberId) {
    state.members = state.members.filter(member => member.id !== memberId);
    persistAppData();
}

export function replacePersistedData({ regionName, members, sessions, plannedWorkouts, aos, qSlots, adminFlags }) {
    state.regionName = regionName;
    state.members = members;
    state.sessions = sessions;
    state.plannedWorkouts = plannedWorkouts;
    state.aos = aos || [];
    state.qSlots = qSlots || [];
    state.adminFlags = adminFlags || [];
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
