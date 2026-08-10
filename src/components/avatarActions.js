export function openAvatarActions({
    hasAvatar = false,
    onChange,
    onRemove,
}) {
    if (!hasAvatar) {
        onChange?.();
        return;
    }

    const overlay = document.createElement("div");
    overlay.classList.add("avatar-actions-overlay");

    const sheet = document.createElement("div");
    sheet.classList.add("avatar-actions");

    const title = document.createElement("div");
    title.classList.add("avatar-actions-title");
    title.textContent = "Profile Photo";

    const changeButton = document.createElement("button");
    changeButton.type = "button";
    changeButton.classList.add("avatar-actions-button");
    changeButton.textContent = "Change Photo";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.classList.add(
        "avatar-actions-button",
        "avatar-actions-button-danger"
    );
    removeButton.textContent = "Remove Photo";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.classList.add(
        "avatar-actions-button",
        "avatar-actions-cancel"
    );
    cancelButton.textContent = "Cancel";

    function close() {
        const scrollY = Number(
            document.body.dataset.avatarActionsScrollY || 0
        );
    
        overlay.remove();
    
        document.body.classList.remove("avatar-actions-open");
        document.body.style.removeProperty("--avatar-actions-scroll-y");
        delete document.body.dataset.avatarActionsScrollY;
    
        window.scrollTo(0, scrollY);
    }

    changeButton.addEventListener("click", () => {
        close();
        onChange?.();
    });

    removeButton.addEventListener("click", () => {
        close();
        onRemove?.();
    });

    cancelButton.addEventListener("click", close);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) close();
    });

    sheet.append(
        title,
        changeButton,
        removeButton,
        cancelButton
    );

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    const scrollY = window.scrollY;

    document.body.dataset.avatarActionsScrollY = String(scrollY);
    document.body.style.setProperty(
        "--avatar-actions-scroll-y",
        scrollY
    );
    document.body.classList.add("avatar-actions-open");
}