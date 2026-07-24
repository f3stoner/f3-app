// services/workspaceService.js

import { state } from "../modules/state.js";
import { replacePersistedData } from "./appData.js";
import {
    checkRegionAccess,
    loadExercises,
    loadProfileAoPermissions,
    loadProfileRegionPositions,
    loadRegionData,
} from "./cloudData.js";
import {
    loadLibraryAutocompleteItems,
    loadLibraryFilterOptions,
} from "./libraryData.js";
import {
    unsubscribeAllManagedChannels,
} from "./realtime.js";

export async function switchWorkspace(
    targetRegionId,
    options = {}
) {
    const {
        bootPhases = null,
        onAccessDenied = null,
    } = options;

    if (!targetRegionId) {
        throw new Error(
            "switchWorkspace requires a target region id."
        );
    }

    /*
     * Invalidate callbacks from the departing workspace
     * synchronously, before awaiting cleanup.
     */
    const generation =
        ++state.workspaceGeneration;

    state.pendingRegionId =
        targetRegionId;

    await unloadWorkspace();

    try {
        const result = await loadWorkspace(
            targetRegionId,
            generation,
            bootPhases
        );

        if (result === "stale") {
            return result;
        }

        if (result === "access-denied") {
            if (
                typeof onAccessDenied ===
                "function"
            ) {
                onAccessDenied(targetRegionId);
            }

            return result;
        }

        return result;
    } catch (error) {
        /*
         * Only the still-current request may clear its
         * own pending workspace marker.
         */
        if (
            generation ===
            state.workspaceGeneration
        ) {
            state.pendingRegionId = null;
        }

        throw error;
    }
}

export async function loadWorkspace(
    targetRegionId,
    generation,
    bootPhases = null
) {
    const isCurrentWorkspaceRequest = () =>
        generation ===
        state.workspaceGeneration;

    let phaseStartedAt =
        performance.now();

    const access =
        await checkRegionAccess(
            state.currentUserId,
            targetRegionId
        );

    if (!isCurrentWorkspaceRequest()) {
        return "stale";
    }

    if (bootPhases) {
        bootPhases.checkRegionAccessMs =
            Math.round(
                performance.now() -
                    phaseStartedAt
            );
    }

    if (!access) {
        /*
         * Do not mutate committed workspace identity or
         * committed regional data here. The requested
         * target remains in pendingRegionId for Region Gate.
         */
        return "access-denied";
    }

    const loadRegionDataQueries = {};

    const timeWorkspacePhase = async (
        phaseName,
        operation
    ) => {
        const startedAt =
            performance.now();

        try {
            return await operation();
        } finally {
            if (bootPhases) {
                bootPhases[phaseName] =
                    Math.round(
                        performance.now() -
                            startedAt
                    );
            }
        }
    };

    const [
        cloudData,
        profileAoPermissions,
        profileRegionPositions,
    ] = await Promise.all([
        timeWorkspacePhase(
            "loadRegionDataMs",
            () =>
                loadRegionData(
                    targetRegionId,
                    loadRegionDataQueries
                )
        ),

        timeWorkspacePhase(
            "profileAoPermissionsMs",
            () =>
                loadProfileAoPermissions(
                    targetRegionId
                )
        ),

        timeWorkspacePhase(
            "profileRegionPositionsMs",
            () =>
                loadProfileRegionPositions(
                    targetRegionId
                )
        ),
    ]);

    if (!isCurrentWorkspaceRequest()) {
        return "stale";
    }

    if (bootPhases) {
        bootPhases.loadRegionDataQueries =
            loadRegionDataQueries;
    }

    phaseStartedAt =
        performance.now();

    /*
     * Atomic workspace commit:
     *
     * Until this point, the previous workspace remains
     * fully committed. Regional data, permissions, and
     * identity are installed together only after every
     * required request succeeds.
     */
    replacePersistedData(cloudData);

    state.profileAoPermissions =
        profileAoPermissions || [];

    state.profileRegionPositions =
        profileRegionPositions || [];

    state.currentRegionId =
        targetRegionId;

    state.activeRegionId =
        targetRegionId;

    state.pendingRegionId = null;

    if (bootPhases) {
        bootPhases.replacePersistedDataMs =
            Math.round(
                performance.now() -
                    phaseStartedAt
            );
    }

    Promise.all([
        loadLibraryAutocompleteItems(),
        loadLibraryFilterOptions(),
    ])
        .then(
            ([items, filterOptions]) => {
                if (
                    !isCurrentWorkspaceRequest()
                ) {
                    return;
                }

                state.libraryItems = items;

                state.libraryFilterOptions =
                    filterOptions;

                state.hasLoadedLibraryItems =
                    true;
            }
        )
        .catch(error => {
            console.warn(
                "Failed to load library data:",
                error
            );
        });

    loadExercises()
        .then(exercises => {
            if (
                !isCurrentWorkspaceRequest()
            ) {
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
    await unsubscribeAllManagedChannels();
}