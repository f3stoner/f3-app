// src/services/mediaService.js

import { supabase } from "./supabaseClient.js";

const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const resolvedUrlCache = new Map();

const inFlightUrlPromises = new Map();

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
    mimeType,
    assetId = crypto.randomUUID()
) {
    if (!memberId) {
        throw new Error("Member id is required to build an avatar path.");
    }

    const extension = mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/jpeg"
            ? "jpg"
            : null;

    if (!extension) {
        throw new Error("Unsupported avatar image type.");
    }

    return `avatars/${memberId}/${assetId}.${extension}`;
}

export async function resolveMediaUrl(path) {
    if (!path) return null;

    const cachedUrl = getCachedMediaUrl(path);

    if (cachedUrl) return cachedUrl;

    const existingPromise = inFlightUrlPromises.get(path);

    if (existingPromise) return existingPromise;

    const requestPromise = (async () => {
        const { data, error } = await supabase.storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

        if (error) {
            console.warn("Failed to resolve media URL:", {
                path,
                error,
            });

            return null;
        }

        const signedUrl = data?.signedUrl || null;

        if (signedUrl) cacheMediaUrl(path, signedUrl);

        return signedUrl;
    })();

    const trackedPromise = requestPromise.finally(() => {
        if (inFlightUrlPromises.get(path) === trackedPromise) {
            inFlightUrlPromises.delete(path);
        }
    });

    inFlightUrlPromises.set(path, trackedPromise);

    return trackedPromise;
}

export async function resolveMediaUrls(paths = []) {
    const cleanPaths = [...new Set(paths.filter(Boolean))];

    if (cleanPaths.length === 0) return new Map();

    const resolved = new Map();
    const pending = [];
    const unresolvedPaths = [];

    cleanPaths.forEach(path => {
        const cachedUrl = getCachedMediaUrl(path);

        if (cachedUrl) {
            resolved.set(path, cachedUrl);
            return;
        }

        const existingPromise = inFlightUrlPromises.get(path);

        if (existingPromise) {
            pending.push({
                path,
                promise: existingPromise,
            });

            return;
        }

        unresolvedPaths.push(path);
    });

    if (unresolvedPaths.length > 0) {
        const batchPromise = (async () => {
            const { data, error } = await supabase.storage
                .from(MEDIA_BUCKET)
                .createSignedUrls(
                    unresolvedPaths,
                    SIGNED_URL_TTL_SECONDS
                );

            if (error) {
                console.warn("Failed to resolve media URLs:", {
                    paths: unresolvedPaths,
                    error,
                });

                return new Map();
            }

            const batchResults = new Map();

            (data || []).forEach(item => {
                const path = item.path || null;
                const signedUrl = item.signedUrl || null;

                if (!path || !signedUrl) return;

                cacheMediaUrl(path, signedUrl);
                batchResults.set(path, signedUrl);
            });

            return batchResults;
        })();

        unresolvedPaths.forEach(path => {
            const requestPromise = batchPromise.then(
                results => results.get(path) || null
            );

            const trackedPromise = requestPromise.finally(() => {
                if (inFlightUrlPromises.get(path) === trackedPromise) {
                    inFlightUrlPromises.delete(path);
                }
            });

            inFlightUrlPromises.set(path, trackedPromise);

            pending.push({
                path,
                promise: trackedPromise,
            });
        });
    }

    const pendingResults = await Promise.all(
        pending.map(async ({ path, promise }) => ({
            path,
            signedUrl: await promise,
        }))
    );

    pendingResults.forEach(({ path, signedUrl }) => {
        if (signedUrl) resolved.set(path, signedUrl);
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

    if (blob.type !== "image/webp" && blob.type !== "image/jpeg") {
        throw new Error("Avatar must be a WebP or JPEG image.");
    }

    const path = buildAvatarPath(memberId, blob.type);

    const { error } =
        await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(
                path,
                blob,
                {
                    contentType: blob.type,
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
    inFlightUrlPromises.clear();
}

export async function reserveMediaAttachment({
    qSlotId = null,
    sessionId = null,
    regionFeedCommentId = null,
    announcementId = null,
    mediaKind,
    mimeType,
    fileSizeBytes = null,
    width = null,
    height = null,
    displayOrder = 0,
}) {
    const { data, error } = await supabase.rpc("reserve_media_attachment", {
        p_q_slot_id: qSlotId,
        p_session_id: sessionId,
        p_region_feed_comment_id: regionFeedCommentId,
        p_announcement_id: announcementId,
        p_media_kind: mediaKind,
        p_mime_type: mimeType,
        p_file_size_bytes: fileSizeBytes,
        p_width: width,
        p_height: height,
        p_display_order: displayOrder,
    });

    if (error) throw error;
    return data;
}

export async function uploadMediaAsset(storagePath, blob) {
    if (!storagePath) {
        throw new Error("Storage path is required.");
    }

    if (!(blob instanceof Blob)) {
        throw new Error("Media upload requires a Blob.");
    }

    const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(storagePath, blob, {
            contentType: blob.type,
            upsert: false,
        });

    if (error) throw error;

    clearResolvedMediaUrl(storagePath);
}

export async function finalizeMediaAsset(mediaAssetId) {
    const { data, error } = await supabase.rpc("finalize_media_asset", {
        p_media_asset_id: mediaAssetId,
    });

    if (error) throw error;
    return data;
}

export async function loadQSlotMediaAttachments(qSlotId) {
    if (!qSlotId) return [];

    const { data, error } = await supabase
        .from("media_attachments")
        .select(`
            id,
            display_order,
            media_assets (
                id,
                storage_path,
                media_kind,
                mime_type,
                file_size_bytes,
                width,
                height,
                status
            )
        `)
        .eq("q_slot_id", qSlotId)
        .order("display_order", { ascending: true });

    if (error) throw error;

    return (data || [])
        .map(row => ({
            id: row.id,
            displayOrder: row.display_order,
            asset: row.media_assets
                ? {
                    id: row.media_assets.id,
                    storagePath: row.media_assets.storage_path,
                    mediaKind: row.media_assets.media_kind,
                    mimeType: row.media_assets.mime_type,
                    fileSizeBytes: row.media_assets.file_size_bytes,
                    width: row.media_assets.width,
                    height: row.media_assets.height,
                    status: row.media_assets.status,
                }
                : null,
        }))
        .filter(item => item.asset?.status === "ready");
}

export async function removeMediaAsset(mediaAssetId) {
    const { data, error } = await supabase.rpc("remove_media_asset", {
        p_media_asset_id: mediaAssetId,
    });

    if (error) throw error;
    return data;
}

export async function loadQSlotMediaAttachmentsBySlotIds(
    qSlotIds = []
) {
    const cleanSlotIds = [
        ...new Set(
            qSlotIds.filter(Boolean)
        ),
    ];

    if (cleanSlotIds.length === 0) {
        return new Map();
    }

    const { data, error } = await supabase
        .from("media_attachments")
        .select(`
            id,
            q_slot_id,
            display_order,
            media_assets (
                id,
                storage_path,
                media_kind,
                mime_type,
                file_size_bytes,
                width,
                height,
                status
            )
        `)
        .in("q_slot_id", cleanSlotIds)
        .order("display_order", {
            ascending: true,
        });

    if (error) throw error;

    const bySlotId = new Map(
        cleanSlotIds.map(
            qSlotId => [
                qSlotId,
                [],
            ]
        )
    );

    (data || []).forEach(row => {
        if (
            !row.q_slot_id ||
            row.media_assets?.status !==
                "ready"
        ) {
            return;
        }

        bySlotId
            .get(row.q_slot_id)
            ?.push({
                id: row.id,
                displayOrder:
                    row.display_order,
                asset: {
                    id:
                        row.media_assets.id,
                    storagePath:
                        row.media_assets.storage_path,
                    mediaKind:
                        row.media_assets.media_kind,
                    mimeType:
                        row.media_assets.mime_type,
                    fileSizeBytes:
                        row.media_assets.file_size_bytes,
                    width:
                        row.media_assets.width,
                    height:
                        row.media_assets.height,
                    status:
                        row.media_assets.status,
                },
            });
    });

    return bySlotId;
}

export async function loadCommentMediaAttachmentsByCommentIds(commentIds = []) {
    const cleanCommentIds = [...new Set(commentIds.filter(Boolean))];

    if (cleanCommentIds.length === 0) return new Map();

    const { data, error } = await supabase
        .from("media_attachments")
        .select(`
            id,
            region_feed_comment_id,
            display_order,
            media_source,
            external_provider,
            external_media_id,
            external_url,
            external_preview_url,
            external_still_url,
            media_assets (
                id,
                storage_path,
                media_kind,
                mime_type,
                file_size_bytes,
                width,
                height,
                status
            )
        `)
        .in("region_feed_comment_id", cleanCommentIds)
        .order("display_order", { ascending: true });

    if (error) throw error;

    const byCommentId = new Map(
        cleanCommentIds.map(commentId => [commentId, []])
    );

    (data || []).forEach(row => {
        if (!row.region_feed_comment_id) return;

        if (row.media_source === "external") {
            byCommentId.get(row.region_feed_comment_id)?.push({
                id: row.id,
                displayOrder: row.display_order,
                source: "external",
                external: {
                    provider: row.external_provider,
                    mediaId: row.external_media_id,
                    url: row.external_url,
                    previewUrl: row.external_preview_url,
                    stillUrl: row.external_still_url,
                },
            });

            return;
        }

        if (row.media_assets?.status !== "ready") return;

        byCommentId.get(row.region_feed_comment_id)?.push({
            id: row.id,
            displayOrder: row.display_order,
            source: "upload",
            asset: {
                id: row.media_assets.id,
                storagePath: row.media_assets.storage_path,
                mediaKind: row.media_assets.media_kind,
                mimeType: row.media_assets.mime_type,
                fileSizeBytes: row.media_assets.file_size_bytes,
                width: row.media_assets.width,
                height: row.media_assets.height,
                status: row.media_assets.status,
            },
        });
    });

    return byCommentId;
}

export async function attachExternalCommentMedia({
    commentId,
    provider,
    externalMediaId,
    externalUrl,
    externalPreviewUrl = null,
    externalStillUrl = null,
    displayOrder = 0,
}) {
    if (!commentId) {
        throw new Error("Comment id is required.");
    }

    const { data, error } = await supabase.rpc(
        "attach_external_comment_media",
        {
            p_comment_id: commentId,
            p_provider: provider,
            p_external_media_id: externalMediaId,
            p_external_url: externalUrl,
            p_external_preview_url: externalPreviewUrl,
            p_external_still_url: externalStillUrl,
            p_display_order: displayOrder,
        }
    );

    if (error) throw error;

    return data;
}