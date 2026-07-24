// services/workspaceService.js

import { state } from "../modules/state.js";
import { replacePersistedData } from "./appData.js";
import {
    checkRegionAccess,
    loadExercises,
    loadRegionData,
} from "./cloudData.js";
import {
    loadLibraryAutocompleteItems,
    loadLibraryFilterOptions,
} from "./libraryData.js";
import { unsubscribeAllManagedChannels } from "./realtime.js";

export async function switchWorkspace(
    activeRegionId,
    options = {}
) {
    const {
        bootPhases = null,
        onAccessDenied = null,
    } = options;

    if (!activeRegionId) {
        throw new Error(
            "switchWorkspace requires an active region id."
        );
    }

    await unloadWorkspace();

    const generation = ++state.workspaceGeneration;

    state.activeRegionId = activeRegionId;

    const result = await loadWorkspace(
        activeRegionId,
        generation,
        bootPhases
    );
    
    if (
        result === "access-denied" &&
        typeof onAccessDenied === "function"
    ) {
        onAccessDenied(activeRegionId);
    }
    
    return result;
}

export async function loadWorkspace(
    activeRegionId,
    generation,
    bootPhases = null
) {
    const isCurrentWorkspace = () =>
        generation === state.workspaceGeneration;

    let phaseStartedAt = performance.now();

    const access = await checkRegionAccess(
        state.currentUserId,
        activeRegionId
    );

    if (!isCurrentWorkspace()) {
        return "stale";
    }

    if (bootPhases) {
        bootPhases.checkRegionAccessMs = Math.round(
            performance.now() - phaseStartedAt
        );
    }

    if (!access) {
        state.currentRegionId = activeRegionId;

        const region = state.availableRegions.find(
            candidate => candidate.id === activeRegionId
        );

        state.regionName = region?.name || "";

        return "access-denied";
    }

    phaseStartedAt = performance.now();

    const loadRegionDataQueries = {};

    const cloudData = await loadRegionData(
        activeRegionId,
        loadRegionDataQueries
    );

    if (!isCurrentWorkspace()) {
        return "stale";
    }

    if (bootPhases) {
        bootPhases.loadRegionDataMs = Math.round(
            performance.now() - phaseStartedAt
        );

        bootPhases.loadRegionDataQueries =
            loadRegionDataQueries;
    }

    phaseStartedAt = performance.now();

    if (!isCurrentWorkspace()) {
        return "stale";
    }

    replacePersistedData(cloudData);

    if (bootPhases) {
        bootPhases.replacePersistedDataMs = Math.round(
            performance.now() - phaseStartedAt
        );
    }

    state.currentRegionId = activeRegionId;

    Promise.all([
        loadLibraryAutocompleteItems(),
        loadLibraryFilterOptions(),
    ])
        .then(([items, filterOptions]) => {
            /*
             * Ignore late responses from a workspace
             * that is no longer active.
             */
            if (!isCurrentWorkspace()) {
                return;
            }

            state.libraryItems = items;
            state.libraryFilterOptions = filterOptions;
            state.hasLoadedLibraryItems = true;
        })
        .catch(error => {
            console.warn(
                "Failed to load library data:",
                error
            );
        });

    loadExercises()
        .then(exercises => {
            if (!isCurrentWorkspace()) {
                return;
            }

            state.exercises = exercises;
        })
        .catch(error => {
            console.error(
                "Failed to load exercises:",
                error
            );
        });

    return "loaded";
}

export async function unloadWorkspace() {
    unsubscribeAllManagedChannels();
}