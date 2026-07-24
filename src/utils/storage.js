const STORAGE_KEY = "f3AppState";
const NAV_STATE_KEY = "theQNavState";
const NAV_RESTORE_TTL_MS = 15 * 60 * 1000;
const EXECUTION_RESTORE_TTL_MS = 4 * 60 * 60 * 1000;
const OFFLINE_BOOT_KEY = "theQOfflineBoot";
const OFFLINE_BOOT_VERSION = 2;

const OFFLINE_DB_NAME = "theQOfflineData";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_REGION_STORE = "regionSnapshots";

export function saveState(state) {
    const data = JSON.stringify({
        regionName: state.regionName,
        members: state.members,
        sessions: state.sessions,
        plannedWorkouts: state.plannedWorkouts,
        sentNotificationKeys: state.sentNotificationKeys,
        workoutFieldLabels: state.workoutFieldLabels,
    });
    localStorage.setItem(STORAGE_KEY, data);
}

export function saveNavState(state) {
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify({
        currentView: state.currentView,
        selectedPlannedWorkoutId: state.selectedPlannedWorkoutId,
        plannedWorkoutLaunchMode: state.plannedWorkoutLaunchMode,
        selectedSessionId: state.selectedSessionId,
        editingSessionId: state.editingSessionId,
        selectedPreblastWorkoutId: state.selectedPreblastWorkoutId,
        savedAt: Date.now(),
        sessionRestoreMode: 
            state.currentView === "session" &&
            state.plannedWorkoutLaunchMode === "execution"
                ? "execution"
                : null,
    }));
}

export function loadNavState() {
    return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || "null");
}

export function loadState() {

    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return null;

        const saved = JSON.parse(data);

        if (saved.groupName && !saved.regionName) {
            saved.regionName = saved.groupName;
            delete saved.groupName;
        }

        if (!saved.plannedWorkouts) {
            saved.plannedWorkouts = [];
        }

        if (!saved.sentNotificationKeys) {
            saved.sentNotificationKeys = [];
        }
        return saved;
    } catch (error) {
        console.error("Failed to load state", error);
        return null;
    }
}

export function getRestoredNavState() {
    const saved = loadNavState();
    if (!saved) return null;

    const now = Date.now();

    const isFresh =
        saved.savedAt &&
        now - saved.savedAt < NAV_RESTORE_TTL_MS;

    const isExecutionValid =
        saved.sessionRestoreMode === "execution" &&
        saved.savedAt &&
        now - saved.savedAt < EXECUTION_RESTORE_TTL_MS &&
        saved.selectedSessionId;

    if (isExecutionValid) {
        return saved;
    }

    if (isFresh) {
        return saved;
    }

    return null;
}

export async function saveOfflineBootSnapshot({
    userId,
    profile,
    availableRegions,
    accessibleRegions,
    activeRegionId,
    profileAoPermissions,
    profileRegionPositions,
    regionData,
}) {
    const profileRegionId =
        profile?.regionId ??
        profile?.region_id;

    if (
        !userId ||
        !profile?.id ||
        !profileRegionId
    ) {
        throw new Error(
            "Offline boot snapshot requires a user and profile."
        );
    }

    if (!activeRegionId) {
        throw new Error(
            "Offline boot snapshot requires an active region."
        );
    }

    await saveOfflineRegionSnapshot({
        userId,
        regionId: activeRegionId,
        regionData,
    });

    const snapshot = {
        version: OFFLINE_BOOT_VERSION,
        savedAt: new Date().toISOString(),

        userId,

        profile: {
            id:
                profile.id,
        
            displayName:
                profile.displayName ??
                profile.display_name ??
                "User",
        
            role:
                profile.role || "pax",
        
            regionId:
                profile.regionId ??
                profile.region_id,
        
            memberId:
                profile.memberId ??
                profile.member_id ??
                null,
        
            customTemplates:
                profile.customTemplates ??
                profile.custom_templates ??
                null,
        },

        availableRegions:
            Array.isArray(availableRegions)
                ? availableRegions
                : [],

        accessibleRegions:
            Array.isArray(accessibleRegions)
                ? accessibleRegions
                : [],
            
        activeRegionId,
        
        profileAoPermissions:
            Array.isArray(profileAoPermissions)
                ? profileAoPermissions
                : [],

        profileRegionPositions:
            Array.isArray(profileRegionPositions)
                ? profileRegionPositions
                : [],
    };

    localStorage.setItem(
        OFFLINE_BOOT_KEY,
        JSON.stringify(snapshot)
    );
}

export function loadOfflineBootSnapshot(userId) {
    if (!userId) return null;

    try {
        const raw =
            localStorage.getItem(OFFLINE_BOOT_KEY);

        if (!raw) return null;

        const snapshot = JSON.parse(raw);

        if (
            snapshot?.version !==
            OFFLINE_BOOT_VERSION
        ) {
            return null;
        }

        if (snapshot.userId !== userId) {
            return null;
        }

        if (
            !snapshot.profile?.id ||
            !snapshot.profile?.regionId ||
            !snapshot.activeRegionId
        ) {
            return null;
        }
        
        const accessibleRegionIds =
            Array.isArray(snapshot.accessibleRegions)
                ? snapshot.accessibleRegions
                    .map(region => region?.id)
                    .filter(Boolean)
                : [];
        
        if (
            accessibleRegionIds.length > 0 &&
            !accessibleRegionIds.includes(
                snapshot.activeRegionId
            )
        ) {
            console.warn(
                "Offline boot snapshot has inconsistent workspace metadata."
            );
        
            return null;
        }

        return snapshot;
    } catch (error) {
        console.error(
            "Failed to load offline boot snapshot:",
            error
        );

        return null;
    }
}

function openOfflineDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(
            OFFLINE_DB_NAME,
            OFFLINE_DB_VERSION
        );

        request.onupgradeneeded = () => {
            const database = request.result;

            if (
                !database.objectStoreNames.contains(
                    OFFLINE_REGION_STORE
                )
            ) {
                database.createObjectStore(
                    OFFLINE_REGION_STORE,
                    {
                        keyPath: "key",
                    }
                );
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(
                request.error ??
                new Error(
                    "Failed to open the offline database."
                )
            );
        };

        request.onblocked = () => {
            reject(
                new Error(
                    "Offline database upgrade was blocked."
                )
            );
        };
    });
}

function createOfflineRegionSnapshotKey(
    userId,
    regionId
) {
    return `${userId}:${regionId}`;
}

export async function saveOfflineRegionSnapshot({
    userId,
    regionId,
    regionData,
}) {
    if (!userId || !regionId) {
        throw new Error(
            "Offline region snapshot requires a user and region."
        );
    }

    if (!regionData) {
        throw new Error(
            "Offline region snapshot requires region data."
        );
    }

    const database =
        await openOfflineDatabase();

    try {
        await new Promise((resolve, reject) => {
            const transaction =
                database.transaction(
                    OFFLINE_REGION_STORE,
                    "readwrite"
                );

            const store =
                transaction.objectStore(
                    OFFLINE_REGION_STORE
                );

            store.put({
                key:
                    createOfflineRegionSnapshotKey(
                        userId,
                        regionId
                    ),

                userId,
                regionId,

                savedAt:
                    new Date().toISOString(),

                regionData,
            });

            transaction.oncomplete = () => {
                resolve();
            };

            transaction.onerror = () => {
                reject(
                    transaction.error ??
                    new Error(
                        "Failed to save the offline region snapshot."
                    )
                );
            };

            transaction.onabort = () => {
                reject(
                    transaction.error ??
                    new Error(
                        "Offline region snapshot save was aborted."
                    )
                );
            };
        });
    } finally {
        database.close();
    }
}

export async function loadOfflineRegionSnapshot({
    userId,
    regionId,
}) {
    if (!userId || !regionId) {
        return null;
    }

    const database =
        await openOfflineDatabase();

    try {
        return await new Promise(
            (resolve, reject) => {
                const transaction =
                    database.transaction(
                        OFFLINE_REGION_STORE,
                        "readonly"
                    );

                const store =
                    transaction.objectStore(
                        OFFLINE_REGION_STORE
                    );

                const request =
                    store.get(
                        createOfflineRegionSnapshotKey(
                            userId,
                            regionId
                        )
                    );

                request.onsuccess = () => {
                    resolve(
                        request.result ?? null
                    );
                };

                request.onerror = () => {
                    reject(
                        request.error ??
                        new Error(
                            "Failed to load the offline region snapshot."
                        )
                    );
                };
            }
        );
    } finally {
        database.close();
    }
}

export async function clearOfflineRegionSnapshots(
    userId = null
) {
    const database =
        await openOfflineDatabase();

    try {
        await new Promise((resolve, reject) => {
            const transaction =
                database.transaction(
                    OFFLINE_REGION_STORE,
                    "readwrite"
                );

            const store =
                transaction.objectStore(
                    OFFLINE_REGION_STORE
                );

            if (!userId) {
                store.clear();
            } else {
                const request =
                    store.openCursor();

                request.onsuccess = () => {
                    const cursor =
                        request.result;

                    if (!cursor) {
                        return;
                    }

                    if (
                        cursor.value?.userId ===
                        userId
                    ) {
                        cursor.delete();
                    }

                    cursor.continue();
                };

                request.onerror = () => {
                    transaction.abort();
                };
            }

            transaction.oncomplete = () => {
                resolve();
            };

            transaction.onerror = () => {
                reject(
                    transaction.error ??
                    new Error(
                        "Failed to clear offline region snapshots."
                    )
                );
            };

            transaction.onabort = () => {
                reject(
                    transaction.error ??
                    new Error(
                        "Clearing offline region snapshots was aborted."
                    )
                );
            };
        });
    } finally {
        database.close();
    }
}

export function clearOfflineBootSnapshot() {
    localStorage.removeItem(OFFLINE_BOOT_KEY);
}