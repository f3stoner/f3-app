// services/workspaceService.js

import { state } from "../modules/state.js";

export async function switchWorkspace(regionId, options = {}) {
    throw new Error("switchWorkspace not implemented.");
}

export async function loadWorkspace(
    profileRegionId,
    bootPhases = null
) {
    const activeRegionId = profileRegionId;
    state.activeRegionId = activeRegionId;

    let phaseStartedAt = performance.now();

    const access = await checkRegionAccess(
        state.currentUserId,
        activeRegionId
    );

    if (bootPhases) {
        bootPhases.checkRegionAccessMs = Math.round(
            performance.now() - phaseStartedAt
        );
    }

    if (!access) {
        state.currentRegionId = activeRegionId;
        const region = state.availableRegions.find(r => r.id === activeRegionId);
        state.regionName = region?.name || "";
        state.currentView = "regionGate";
        renderApp();
        return false;
    }

    phaseStartedAt = performance.now();

    const loadRegionDataQueries = {};

    const cloudData = await loadRegionData(
        activeRegionId,
        loadRegionDataQueries
    );

    if (bootPhases) {
        bootPhases.loadRegionDataMs = Math.round(
            performance.now() - phaseStartedAt
        );

        bootPhases.loadRegionDataQueries =
            loadRegionDataQueries;
    }

    phaseStartedAt = performance.now();

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
            state.libraryItems = items;
            state.libraryFilterOptions = filterOptions;
            state.hasLoadedLibraryItems = true;
        })
        .catch(error => {
            console.warn("Failed to load library data:", error);
        });

    loadExercises()
        .then(exercises => {
            state.exercises = exercises;
        })
        .catch(error => {
            console.error("Failed to load exercises:", error);
        });

    return true;
}

export async function unloadWorkspace() {
    // Placeholder for future:
    // - realtime cleanup
    // - timers
    // - caches
}