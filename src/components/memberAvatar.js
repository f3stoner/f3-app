function getMemberInitials(member) {
    const displayName =
        member?.paxName ||
        member?.displayName ||
        "PAX";

    const words = displayName
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return "P";
    }

    if (words.length === 1) {
        const letters = words[0]
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 2);

        return letters.toUpperCase() || "P";
    }

    return words
        .slice(0, 2)
        .map(word => word.charAt(0))
        .join("")
        .toUpperCase();
}

export function createMemberAvatar(
    member,
    {
        signedUrl = null,
        className = "",
        interactive = false,
        onActivate = null,
    } = {}
) {
    const element = document.createElement(
        interactive
            ? "button"
            : "div"
    );

    if (interactive) {
        element.type = "button";
    }

    element.classList.add(
        "member-avatar"
    );

    if (className) {
        element.classList.add(
            className
        );
    }

    if (interactive) {
        element.classList.add(
            "member-avatar-interactive"
        );

        element.setAttribute(
            "aria-label",
            signedUrl
                ? "Change profile photo"
                : "Add profile photo"
        );
    } else {
        element.setAttribute(
            "aria-hidden",
            "true"
        );
    }

    const fallback =
        document.createElement("div");

    fallback.classList.add(
        "member-avatar-fallback"
    );

    fallback.textContent =
        getMemberInitials(member);

    element.appendChild(
        fallback
    );

    if (signedUrl) {
        const image =
            document.createElement("img");

        image.classList.add(
            "member-avatar-image"
        );

        image.alt = "";
        image.decoding = "async";
        image.src = signedUrl;

        image.addEventListener(
            "load",
            () => {
                element.classList.add(
                    "member-avatar-loaded"
                );
            }
        );

        image.addEventListener(
            "error",
            () => {
                image.remove();

                element.classList.remove(
                    "member-avatar-loaded"
                );
            }
        );

        element.appendChild(
            image
        );
    }

    if (
        interactive &&
        typeof onActivate === "function"
    ) {
        element.addEventListener(
            "click",
            onActivate
        );
    }

    return element;
}