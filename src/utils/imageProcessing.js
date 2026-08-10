// src/utils/imageProcessing.js

import { heicTo, isHeic } from "heic-to";

const AVATAR_SIZE = 512;
const AVATAR_QUALITY = 0.82;
const MAX_SOURCE_FILE_SIZE =
    20 * 1024 * 1024;
const MAX_SOURCE_PIXELS =
    40 * 1000 * 1000;
const MAX_AVATAR_FILE_SIZE =
    1024 * 1024;

const MEDIA_MAX_DIMENSION = 2048;
const MEDIA_QUALITY = 0.84;
const MAX_MEDIA_SOURCE_FILE_SIZE = 20 * 1024 * 1024;
const MAX_MEDIA_SOURCE_PIXELS = 40 * 1000 * 1000;
const MAX_MEDIA_OUTPUT_SIZE = 3 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);

export async function normalizeMediaImage(file) {
    if (!(file instanceof Blob)) {
        throw new Error("Image processing requires a Blob.");
    }

    if (file.size > MAX_MEDIA_SOURCE_FILE_SIZE) {
        throw new Error("That image is too large. Choose a photo under 20 MB.");
    }

    const fileName = String(file.name || "").toLowerCase();

    const isHeicImage =
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        fileName.endsWith(".heic") ||
        fileName.endsWith(".heif") ||
        await isHeic(file);

    let sourceBlob = file;

    if (isHeicImage) {
        sourceBlob = await heicTo({
            blob: file,
            type: "image/jpeg",
            quality: MEDIA_QUALITY,
        });
    }

    const image = await decodeImageFile(sourceBlob);

    try {
        validateMediaImageDimensions(image.width, image.height);

        const scale = Math.min(
            1,
            MEDIA_MAX_DIMENSION / Math.max(image.width, image.height)
        );

        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Image processing is not supported on this device.");
        }

        context.drawImage(
            image.source,
            0,
            0,
            image.width,
            image.height,
            0,
            0,
            width,
            height
        );

        let blob = await canvasToBlob(canvas, "image/webp", MEDIA_QUALITY);

        if (!blob || blob.type !== "image/webp") {
            blob = await canvasToBlob(canvas, "image/jpeg", MEDIA_QUALITY);
        }

        if (!blob) {
            throw new Error("The image could not be processed.");
        }

        if (blob.size > MAX_MEDIA_OUTPUT_SIZE) {
            throw new Error("The processed image is still too large.");
        }

        return blob;
    } finally {
        image.cleanup();
    }
}

function validateMediaImageDimensions(width, height) {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        throw new Error("That image could not be read.");
    }

    if (width * height > MAX_MEDIA_SOURCE_PIXELS) {
        throw new Error("That image is too large to process safely.");
    }
}

export async function canvasToAvatarBlob(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("A valid crop canvas is required.");
    }

    let blob = await canvasToBlob(canvas, "image/webp", AVATAR_QUALITY);

    if (!blob || blob.type !== "image/webp") {
        blob = await canvasToBlob(canvas, "image/jpeg", AVATAR_QUALITY);
    }

    if (!blob) {
        throw new Error("The profile photo could not be created.");
    }

    if (blob.type !== "image/webp" && blob.type !== "image/jpeg") {
        throw new Error("This device cannot create a supported profile photo.");
    }

    if (blob.size > MAX_AVATAR_FILE_SIZE) {
        throw new Error("The processed profile photo is too large.");
    }

    return blob;
}

function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, type, quality);
    });
}

export function validateAvatarSourceFile(
    file
) {
    if (!(file instanceof File)) {
        throw new Error(
            "Select an image to use as your profile photo."
        );
    }

    if (
        file.size >
        MAX_SOURCE_FILE_SIZE
    ) {
        throw new Error(
            "That image is too large. Choose a photo under 20 MB."
        );
    }

    const type =
        String(file.type || "")
            .toLowerCase();

    const fileName =
        String(file.name || "")
            .toLowerCase();

    const hasAllowedType =
        ALLOWED_IMAGE_TYPES.has(type);

    const hasHeicExtension =
        fileName.endsWith(".heic") ||
        fileName.endsWith(".heif");

    if (
        !hasAllowedType &&
        !hasHeicExtension
    ) {
        throw new Error(
            "Choose a JPG, PNG, WebP, HEIC, or HEIF image."
        );
    }
}

export async function processAvatarImage(
    file
) {
    validateAvatarSourceFile(file);

    const image =
        await decodeImageFile(file);

    try {
        validateImageDimensions(
            image.width,
            image.height
        );

        const cropSize =
            Math.min(
                image.width,
                image.height
            );

        const sourceX =
            Math.max(
                0,
                (
                    image.width -
                    cropSize
                ) / 2
            );

        const sourceY =
            Math.max(
                0,
                (
                    image.height -
                    cropSize
                ) / 2
            );

        return await renderAvatarBlob({
            source: image.source,
            sourceX,
            sourceY,
            sourceSize: cropSize,
        });
    } finally {
        image.cleanup();
    }
}

export async function validateAvatarSourceDimensions(file) {
    validateAvatarSourceFile(file);

    const image = await decodeImageFile(file);

    try {
        validateImageDimensions(image.width, image.height);
    } finally {
        image.cleanup();
    }
}

function validateImageDimensions(
    width,
    height
) {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        throw new Error(
            "That image could not be read."
        );
    }

    if (
        width * height >
        MAX_SOURCE_PIXELS
    ) {
        throw new Error(
            "That image is too large to process safely. Choose a smaller photo."
        );
    }
}

async function decodeImageFile(
    file
) {
    if (
        typeof createImageBitmap ===
        "function"
    ) {
        try {
            const bitmap =
                await createImageBitmap(
                    file,
                    {
                        imageOrientation:
                            "from-image",
                    }
                );

            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                cleanup() {
                    bitmap.close();
                },
            };
        } catch (error) {
            console.warn(
                "createImageBitmap failed for avatar source:",
                error
            );
        }
    }

    return decodeImageElement(file);
}

function decodeImageElement(
    file
) {
    return new Promise(
        (resolve, reject) => {
            const objectUrl =
                URL.createObjectURL(
                    file
                );

            const image =
                new Image();

            const cleanup = () => {
                URL.revokeObjectURL(
                    objectUrl
                );
            };

            image.onload = () => {
                resolve({
                    source: image,
                    width:
                        image.naturalWidth,
                    height:
                        image.naturalHeight,
                    cleanup,
                });
            };

            image.onerror = () => {
                cleanup();

                const fileName =
                    String(
                        file.name || ""
                    ).toLowerCase();

                const isHeic =
                    file.type ===
                        "image/heic" ||
                    file.type ===
                        "image/heif" ||
                    fileName.endsWith(
                        ".heic"
                    ) ||
                    fileName.endsWith(
                        ".heif"
                    );

                reject(
                    new Error(
                        isHeic
                            ? "This HEIC photo could not be opened on this device. Choose a JPG, PNG, or WebP image."
                            : "That image could not be opened."
                    )
                );
            };

            image.src =
                objectUrl;
        }
    );
}

function renderAvatarBlob({
    source,
    sourceX,
    sourceY,
    sourceSize,
}) {
    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width =
        AVATAR_SIZE;

    canvas.height =
        AVATAR_SIZE;

    const context =
        canvas.getContext("2d");

    if (!context) {
        throw new Error(
            "Image processing is not supported on this device."
        );
    }

    context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        AVATAR_SIZE,
        AVATAR_SIZE
    );

    return new Promise(
        (resolve, reject) => {
            canvas.toBlob(
                blob => {
                    if (!blob) {
                        reject(
                            new Error(
                                "The profile photo could not be created."
                            )
                        );

                        return;
                    }

                    if (
                        blob.type !==
                        "image/webp"
                    ) {
                        reject(
                            new Error(
                                "WebP image processing is not supported on this device."
                            )
                        );

                        return;
                    }

                    if (
                        blob.size >
                        MAX_AVATAR_FILE_SIZE
                    ) {
                        reject(
                            new Error(
                                "The processed profile photo is too large."
                            )
                        );

                        return;
                    }

                    resolve(blob);
                },
                "image/webp",
                AVATAR_QUALITY
            );
        }
    );
}