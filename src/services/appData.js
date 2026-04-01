import { state } from "../modules/state.js";
import { saveState } from "../utils/storage.js";
import { REGION_ID } from "../config.js";
import { insertMember, updateMemberInCloud } from "./cloudData.js";
import { insertSession, updateSessionInCloud, deleteSessionFromCloud } from "./cloudData.js";
import { insertPlannedWorkout, updatePlannedWorkoutInCloud } from "./cloudData.js";

export function persistAppData() {
    saveState(state);
}

export async function addSession(session) {
    const savedSession = await insertSession(REGION_ID, session)
    state.sessions.push(savedSession);
    persistAppData();
    return savedSession;
}

export async function updateSession(sessionId, updatedSession) {
    const savedSession = await updateSessionInCloud(REGION_ID, updatedSession);
    const index = state.sessions.findIndex(session => session.id === sessionId);
    if (index === -1) return false;

    state.sessions[index] = savedSession;
    persistAppData();
    return true;
}

export async function deleteSession(sessionId) {
    await deleteSessionFromCloud(REGION_ID, sessionId);

    state.sessions = state.sessions.filter(
        session => session.id !== sessionId
    );
    
    persistAppData();
}

export async function addPlannedWorkout(workout) {
    const savedWorkout = await insertPlannedWorkout(REGION_ID, workout);
    state.plannedWorkouts.push(savedWorkout);
    persistAppData();
    return savedWorkout;
}

export async function updatePlannedWorkout(workoutId, updatedWorkout) {
    const savedWorkout = await updatePlannedWorkoutInCloud(REGION_ID, updatedWorkout);
    const index = state.plannedWorkouts.findIndex(workout => workout.id === workoutId);
    if (index === -1) return false;

    state.plannedWorkouts[index] = savedWorkout;
    persistAppData();
    return true;
}

export function removePlannedWorkoutFromState(workoutId) {
    state.plannedWorkouts = state.plannedWorkouts.filter(workout => workout.id !== workoutId);
    persistAppData();
}

export async function addMember(member) {
    const savedMember = await insertMember(REGION_ID, member);
    state.members.push(savedMember);
    persistAppData();
    return savedMember;
}

export async function updateMember(memberId, updatedMember) {
    const savedMember = await updateMemberInCloud(REGION_ID, updatedMember);
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

export function replacePersistedData({ regionName, members, sessions, plannedWorkouts }) {
    state.regionName = regionName;
    state.members = members;
    state.sessions = sessions;
    state.plannedWorkouts = plannedWorkouts;
    persistAppData();
}

