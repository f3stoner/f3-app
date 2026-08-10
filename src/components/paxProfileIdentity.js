import { createMemberAvatar } from "./memberAvatar.js";

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
        avatarUrl = null,
        avatarInteractive = false,
        onAvatarActivate = null,
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
    createMemberAvatar(
        member,
        {
            signedUrl:
                avatarUrl,
            interactive:
                avatarInteractive,
            onActivate:
                onAvatarActivate,
            className:
                "pax-profile-avatar",
        }
    );

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