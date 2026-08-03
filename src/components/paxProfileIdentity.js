function getPaxInitials(member) {
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

function getProfileSubtitleParts(member) {
    return [
        member?.regionName ||
            member?.region_name ||
            member?.homeRegionName,
        member?.aoName ||
            member?.homeAo ||
            member?.homeAoName,
    ].filter(Boolean);
}

export function createPaxProfileIdentity(
    member,
    {
        memberSince = null,
    } = {}
) {
    const identity =
        document.createElement("section");

    identity.classList.add(
        "pax-profile-identity"
    );

    const glow =
        document.createElement("div");

    glow.classList.add(
        "pax-profile-identity-glow"
    );

    glow.setAttribute(
        "aria-hidden",
        "true"
    );

    const avatar =
        document.createElement("div");

    avatar.classList.add(
        "pax-profile-avatar"
    );

    avatar.setAttribute(
        "aria-hidden",
        "true"
    );

    const avatarInner =
        document.createElement("div");

    avatarInner.classList.add(
        "pax-profile-avatar-inner"
    );

    avatarInner.textContent =
        getPaxInitials(member);

    avatar.appendChild(avatarInner);

    const name =
        document.createElement("h1");

    name.classList.add(
        "pax-profile-name"
    );

    name.textContent =
        member?.paxName ||
        member?.displayName ||
        "Unnamed PAX";

    const subtitleParts =
        getProfileSubtitleParts(member);

    const subtitle =
        document.createElement("div");

    subtitle.classList.add(
        "pax-profile-subtitle"
    );

    subtitle.textContent =
        subtitleParts.join(" · ");

    identity.append(
        glow,
        avatar,
        name
    );

    if (subtitle.textContent) {
        identity.appendChild(subtitle);
    }

    if (memberSince) {
        const memberSinceEl =
            document.createElement("div");

        memberSinceEl.classList.add(
            "pax-profile-member-since"
        );

        memberSinceEl.textContent =
            `Member since ${memberSince}`;

        identity.appendChild(
            memberSinceEl
        );
    }

    return identity;
}