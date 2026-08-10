// src/services/mediaService.js

import { supabase } from "./supabaseClient.js";

const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const resolvedUrlCache = new Map();

function getCachedMediaUrl(path) {
    if (!path) return null;

    const cached = resolvedUrlCache.get(path);

    if (!cached) return null;

    if (
        cached.expiresAt -
            SIGNED_URL_REFRESH_BUFFER_MS <=
        Date.now()
    ) {
        resolvedUrlCache.delete(path);
        return null;
    }

    return cached.signedUrl;
}

function cacheMediaUrl(path, signedUrl) {
    if (!path || !signedUrl) return;

    resolvedUrlCache.set(path, {
        signedUrl,
        expiresAt:
            Date.now() +
            SIGNED_URL_TTL_SECONDS * 1000,
    });
}

export function buildAvatarPath(
    memberId,
    assetId = crypto.randomUUID()
) {
    if (!memberId) {
        throw new Error(
            "Member id is required to build an avatar path."
        );
    }

    return `avatars/${memberId}/${assetId}.webp`;
}

export async function resolveMediaUrl(path) {
    if (!path) return null;

    const cachedUrl =
        getCachedMediaUrl(path);

    if (cachedUrl) {
        return cachedUrl;
    }

    const { data, error } =
        await supabase.storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(
                path,
                SIGNED_URL_TTL_SECONDS
            );

    if (error) {
        console.warn(
            "Failed to resolve media URL:",
            {
                path,
                error,
            }
        );

        return null;
    }

    const signedUrl =
        data?.signedUrl || null;

    if (signedUrl) {
        cacheMediaUrl(
            path,
            signedUrl
        );
    }

    return signedUrl;
}

export async function resolveMediaUrls(
    paths = []
) {
    const cleanPaths = [
        ...new Set(
            paths.filter(Boolean)
        ),
    ];

    if (cleanPaths.length === 0) {
        return new Map();
    }

    const resolved = new Map();
    const unresolvedPaths = [];

    cleanPaths.forEach(path => {
        const cachedUrl =
            getCachedMediaUrl(path);

        if (cachedUrl) {
            resolved.set(
                path,
                cachedUrl
            );
        } else {
            unresolvedPaths.push(path);
        }
    });

    if (
        unresolvedPaths.length === 0
    ) {
        return resolved;
    }

    const { data, error } =
        await supabase.storage
            .from(MEDIA_BUCKET)
            .createSignedUrls(
                unresolvedPaths,
                SIGNED_URL_TTL_SECONDS
            );

    if (error) {
        console.warn(
            "Failed to resolve media URLs:",
            {
                paths:
                    unresolvedPaths,
                error,
            }
        );

        return resolved;
    }

    (data || []).forEach(item => {
        const path =
            item.path || null;

        const signedUrl =
            item.signedUrl || null;

        if (
            !path ||
            !signedUrl
        ) {
            return;
        }

        cacheMediaUrl(
            path,
            signedUrl
        );

        resolved.set(
            path,
            signedUrl
        );
    });

    return resolved;
}

export async function uploadAvatar(
    memberId,
    blob
) {
    if (!memberId) {
        throw new Error(
            "Member id is required to upload an avatar."
        );
    }

    if (!(blob instanceof Blob)) {
        throw new Error(
            "Avatar upload requires a Blob."
        );
    }

    if (
        blob.type !== "image/webp"
    ) {
        throw new Error(
            "Avatar must be a WebP image."
        );
    }

    const path =
        buildAvatarPath(memberId);

    const { error } =
        await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(
                path,
                blob,
                {
                    contentType:
                        "image/webp",
                    upsert: false,
                }
            );

    if (error) {
        console.error(
            "Failed to upload avatar:",
            {
                memberId,
                path,
                error,
            }
        );

        throw error;
    }

    clearResolvedMediaUrl(path);

    return path;
}

export async function removeMediaObjects(
    paths = []
) {
    const cleanPaths = [
        ...new Set(
            paths.filter(Boolean)
        ),
    ];

    if (cleanPaths.length === 0) {
        return;
    }

    const { error } =
        await supabase.storage
            .from(MEDIA_BUCKET)
            .remove(cleanPaths);

    if (error) {
        console.error(
            "Failed to remove media objects:",
            {
                paths:
                    cleanPaths,
                error,
            }
        );

        throw error;
    }

    cleanPaths.forEach(
        clearResolvedMediaUrl
    );
}

export function clearResolvedMediaUrl(
    path
) {
    if (!path) return;

    resolvedUrlCache.delete(path);
}

export function clearResolvedMediaUrls(
    paths = []
) {
    paths.forEach(
        clearResolvedMediaUrl
    );
}

export function clearMediaUrlCache() {
    resolvedUrlCache.clear();
}