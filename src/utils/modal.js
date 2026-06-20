let activeModalOverlay = null;
let previousBodyOverflow = "";

export function closeActiveModal() {
    if (!activeModalOverlay) return;

    activeModalOverlay.remove();
    activeModalOverlay = null;

    document.body.style.overflow = previousBodyOverflow;
}

export function createModalShell() {
    closeActiveModal();

    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.classList.add("modal-overlay");

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            closeActiveModal();
        }
    });

    const modal = document.createElement("div");
    modal.classList.add("modal");

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    activeModalOverlay = overlay;

    return { overlay, modal, closeModal: closeActiveModal };
}