import Cropper from "cropperjs";
import {
    canvasToAvatarBlob,
    validateAvatarSourceFile,
} from "../utils/imageProcessing.js";

export function openAvatarEditor(file) {
    validateAvatarSourceFile(file);

    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);

        const overlay = document.createElement("div");
        overlay.classList.add("avatar-editor-overlay");

        const panel = document.createElement("div");
        panel.classList.add("avatar-editor");

        const header = document.createElement("div");
        header.classList.add("avatar-editor-header");

        const title = document.createElement("div");
        title.classList.add("avatar-editor-title");
        title.textContent = "Adjust Photo";

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.classList.add("avatar-editor-close");
        closeButton.textContent = "×";
        closeButton.setAttribute("aria-label", "Cancel photo editing");

        header.append(title, closeButton);

        const cropArea = document.createElement("div");
        cropArea.classList.add("avatar-editor-crop");

        const image = document.createElement("img");
        image.alt = "Profile photo crop preview";
        
        cropArea.appendChild(image);

        const help = document.createElement("div");
        help.classList.add("avatar-editor-help");
        help.textContent = "Drag to reposition · Scroll or pinch to zoom";

        const actions = document.createElement("div");
        actions.classList.add("avatar-editor-actions");

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.classList.add("btn", "secondary");
        cancelButton.textContent = "Cancel";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.classList.add("btn", "primary");
        saveButton.textContent = "Save Photo";

        actions.append(cancelButton, saveButton);
        panel.append(header, cropArea, help, actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        document.body.classList.add("avatar-editor-open");

        let cropper = null;
        let finished = false;

        function cleanup() {
            if (finished) return;

            finished = true;
            URL.revokeObjectURL(objectUrl);
            overlay.remove();
            document.body.classList.remove("avatar-editor-open");
        }

        function cancel() {
            cleanup();
            resolve(null);
        }

        closeButton.addEventListener("click", cancel);
        cancelButton.addEventListener("click", cancel);

        image.addEventListener("load", () => {
            cropper = new Cropper(image, {
                container: cropArea,
                template: `
                    <cropper-canvas background scale-step="0.08">
                        <cropper-image scalable translatable></cropper-image>
                        <cropper-shade></cropper-shade>
        
                        <cropper-selection
                            initial-coverage="0.72"
                            aspect-ratio="1"
                            initial-aspect-ratio="1"
                            outlined
                        >
                            <cropper-handle action="move" plain></cropper-handle>
                        </cropper-selection>
        
                        <cropper-handle action="move" plain></cropper-handle>
                    </cropper-canvas>
                `,
            });

            const cropperImage = cropper.getCropperImage();
            const selection = cropper.getCropperSelection();

            if (!cropperImage || !selection) {
                throw new Error("Avatar cropper could not be initialized.");
            }

            cropperImage.$center("cover");

            let lastValidTransform = cropperImage.$getTransform();

            cropperImage.addEventListener("transform", event => {
                const nextTransform = event.detail.matrix;

                requestAnimationFrame(() => {
                    const imageRect = cropperImage.getBoundingClientRect();
                    const selectionRect = selection.getBoundingClientRect();

                    const coversSelection =
                        imageRect.left <= selectionRect.left &&
                        imageRect.top <= selectionRect.top &&
                        imageRect.right >= selectionRect.right &&
                        imageRect.bottom >= selectionRect.bottom;

                    if (coversSelection) {
                        lastValidTransform = nextTransform;
                        return;
                    }

                    cropperImage.$setTransform(lastValidTransform);
                });
            });
        }, { once: true });

        image.addEventListener("error", () => {
            cleanup();
            reject(new Error("That image could not be opened."));
        }, { once: true });

        image.src = objectUrl;

        saveButton.addEventListener("click", async () => {
            if (!cropper) return;

            try {
                const selection = cropper.getCropperSelection();

                if (!selection) {
                    throw new Error("No crop selection is available.");
                }

                saveButton.disabled = true;
                saveButton.textContent = "Saving…";

                const canvas = await selection.$toCanvas({
                    width: 512,
                    height: 512,
                });

                const blob = await canvasToAvatarBlob(canvas);

                cleanup();
                resolve(blob);
            } catch (error) {
                saveButton.disabled = false;
                saveButton.textContent = "Save Photo";
                reject(error);
                cleanup();
            }
        });
    });
}