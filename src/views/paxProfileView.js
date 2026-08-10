import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { createPaxProfileNav } from "../components/paxProfileNav.js";
import { canViewPaxOverview } from "../utils/permissions.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { getMemberById } from "../utils/memberLookup.js";
import { createPaxProfileIdentity } from "../components/paxProfileIdentity.js";
import { processAvatarImage } from "../utils/imageProcessing.js";
import {
    resolveMediaUrl,
    uploadAvatar,
    removeMediaObjects,
    clearResolvedMediaUrl,
} from "../services/mediaService.js";
import { setMemberAvatarInCloud } from "../services/cloudData.js";
import { openAvatarEditor } from "../components/avatarEditor.js";
import { openAvatarActions } from "../components/avatarActions.js";


function getSelectedMember() {
    return getMemberById(
        state.selectedPaxId
    );
}

async function removeAvatar(member) {
    const previousAvatarPath = member.avatarPath;

    if (!previousAvatarPath) return;

    try {
        const result = await setMemberAvatarInCloud(
            member.id,
            null
        );

        member.avatarPath = null;

        if (state.currentUserMember?.id === member.id) {
            state.currentUserMember.avatarPath = null;
        }

        const stateMember = state.members.find(
            candidate => candidate.id === member.id
        );

        if (stateMember) {
            stateMember.avatarPath = null;
        }

        const participant = state.participants.find(
            candidate => candidate.id === member.id
        );

        if (participant) {
            participant.avatarPath = null;
        }

        clearResolvedMediaUrl(previousAvatarPath);

        removeMediaObjects([
            previousAvatarPath,
        ]).catch(error => {
            console.warn(
                "Failed to remove previous avatar:",
                error
            );
        });

        renderPaxProfileView();
    } catch (error) {
        console.error(
            "Failed to remove profile avatar:",
            error
        );

        alert(
            error.message ||
            "Unable to remove profile photo."
        );
    }
}

function createProfileIdentity(member, memberSince, avatarUrl = null) {
    const isCurrentUser = member?.id === state.currentUserMemberId;

    return createPaxProfileIdentity(member, {
        memberSince,
        avatarUrl,
        avatarInteractive: isCurrentUser,
        onAvatarActivate: isCurrentUser
            ? () => openAvatarActions({
                hasAvatar: Boolean(member.avatarPath),
                onChange: () => selectAndUploadAvatar(member),
                onRemove: () => removeAvatar(member),
            })
            : null,
    });
}

async function selectAndUploadAvatar(member) {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;

        let uploadedPath = null;

        try {
            const blob = await openAvatarEditor(file);
            if (!blob) return;

            uploadedPath = await uploadAvatar(
                member.id,
                blob
            );

            const result = await setMemberAvatarInCloud(
                member.id,
                uploadedPath
            );

            clearResolvedMediaUrl(uploadedPath);

            member.avatarPath = result.member.avatarPath;

            if (state.currentUserMember?.id === member.id) {
                state.currentUserMember.avatarPath = result.member.avatarPath;
            }

            const stateMember = state.members.find(candidate => candidate.id === member.id);
            if (stateMember) stateMember.avatarPath = result.member.avatarPath;

            const participant = state.participants.find(candidate => candidate.id === member.id);
            if (participant) participant.avatarPath = result.member.avatarPath;

            if (result.previousAvatarPath) {
                removeMediaObjects([
                    result.previousAvatarPath,
                ]).catch(error => {
                    console.warn("Failed to remove previous avatar:", error);
                });
            }

            renderPaxProfileView();
        } catch (error) {
            console.error("Failed to update profile avatar:", error);

            if (uploadedPath) {
                removeMediaObjects([uploadedPath]).catch(cleanupError => {
                    console.warn("Failed to clean up avatar upload:", cleanupError);
                });
            }

            alert(error.message || "Unable to update profile photo.");
        }
    }, { once: true });

    input.click();
}

function getMemberStats(memberId) {
    return state.memberStats?.find(stat =>
        stat.memberId === memberId || stat.member_id === memberId
    ) || null;
}

function calculateQScore(stats) {
    const posts = Number(stats?.posts) || 0;
    const qs = Number(stats?.qs) || 0;

    if (posts <= 0) return 0;

    return (qs / posts) * 100;
}

function formatPercentage(value) {
    if (!Number.isFinite(value)) return "0%";

    const rounded = Math.round(value * 10) / 10;

    return Number.isInteger(rounded)
        ? `${rounded}%`
        : `${rounded.toFixed(1)}%`;
}

function getLeadershipInsight(stats) {
    const posts = Number(stats?.posts) || 0;
    const qs = Number(stats?.qs) || 0;
    const qScore = calculateQScore({ posts, qs });

    if (posts < 10) {
        return {
            title: "Getting Established",
            message:
                "Keep posting, building relationships, and learning the rhythm of the region. When you are ready, begin looking for an opportunity to lead.",
            tone: "neutral",
        };
    }

    if (qs === 0) {
        return {
            title: "Your First Q Is Ahead",
            message:
                "You have built a foundation through consistent posting. Leading one workout is the next step.",
            tone: "encourage",
        };
    }

    if (qScore < 10) {
        return {
            title: "Room to Step Forward",
            message:
                "You are contributing consistently. Leading a little more often would help share the work of the region.",
            tone: "encourage",
        };
    }

    if (qScore < 20) {
        return {
            title: "Healthy Contributor",
            message:
                "You have developed a healthy balance between posting and leading. Keep building consistency.",
            tone: "positive",
        };
    }

    if (qScore < 30) {
        return {
            title: "Leadership Anchor",
            message:
                "You are a dependable part of the Q rotation. Keep leading, and use your influence to encourage other men to step forward.",
            tone: "positive",
        };
    }

    if (qScore < 40) {
        return {
            title: "Multiplying Leadership",
            message:
                "You are carrying a significant share of the Q rotation. Your next leadership opportunity is helping other men gain the confidence to lead.",
            tone: "watch",
        };
    }

    return {
        title: "Develop the Next Qs",
        message:
            "You have demonstrated a strong willingness to lead. The greatest impact now may come from recruiting, encouraging, and preparing other men to take the Q.",
        tone: "watch",
    };
}

function getMemberSessions(memberId) {
    return state.sessions
        .filter(session => {
            const attendeeIds = Array.isArray(session.attendeeIds)
                ? session.attendeeIds
                : [];

            const fngMemberIds = Array.isArray(session.fngs)
                ? session.fngs.map(fng => fng?.memberId).filter(Boolean)
                : [];

            return attendeeIds.includes(memberId) || fngMemberIds.includes(memberId);
        })
        .sort((a, b) => b.date.localeCompare(a.date));
}

function createMetricCard(label, value, modifier = "") {
    const card = document.createElement("div");
    card.classList.add("pax-metric-card");

    if (modifier) {
        card.classList.add(`pax-metric-card-${modifier}`);
    }

    const valueEl = document.createElement("div");
    valueEl.classList.add("pax-metric-value");
    valueEl.textContent = value ?? "-";

    const labelEl = document.createElement("div");
    labelEl.classList.add("pax-metric-label");
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
}

function createLeadershipCard(insight, stats) {
    const card =
        document.createElement("div");

    card.classList.add(
        "pax-leadership-card",
        `pax-leadership-card-${
            insight.tone || "neutral"
        }`
    );

    const eyebrow =
        document.createElement("div");

    eyebrow.classList.add(
        "pax-leadership-eyebrow"
    );

    eyebrow.textContent =
        "Leadership Rhythm";

    const title =
        document.createElement("div");

    title.classList.add(
        "pax-leadership-title"
    );

    title.textContent =
        insight.title;

    const body =
        document.createElement("div");

    body.classList.add(
        "pax-leadership-message"
    );

    body.textContent =
        insight.message;

    const recentActivity =
        document.createElement("div");

    recentActivity.classList.add(
        "pax-leadership-recent"
    );

    function createRecentRow(
        label,
        posts,
        qs
    ) {
        const row =
            document.createElement("div");

        row.classList.add(
            "pax-leadership-recent-row"
        );

        const labelEl =
            document.createElement("div");

        labelEl.classList.add(
            "pax-leadership-recent-label"
        );

        labelEl.textContent = label;

        const valueEl =
            document.createElement("div");

        valueEl.classList.add(
            "pax-leadership-recent-value"
        );

        valueEl.textContent =
            `${posts ?? 0} posts · ` +
            `${qs ?? 0} Qs`;

        row.append(
            labelEl,
            valueEl
        );

        return row;
    }

    recentActivity.append(
        createRecentRow(
            "Last 30 Days",
            stats?.posts30Days,
            stats?.qs30Days
        ),
        createRecentRow(
            "Last 90 Days",
            stats?.posts90Days,
            stats?.qs90Days
        )
    );

    card.append(
        eyebrow,
        title,
        body,
        recentActivity
    );

    return card;
}

function createProfileFact(label, value) {
    const row = document.createElement("div");
    row.classList.add("pax-profile-fact");

    const labelEl = document.createElement("div");
    labelEl.classList.add("pax-profile-fact-label");
    labelEl.textContent = label;

    const valueEl = document.createElement("div");
    valueEl.classList.add("pax-profile-fact-value");
    valueEl.textContent = value || "-";

    row.append(labelEl, valueEl);

    return row;
}

function createSection(title, content) {
    const section = document.createElement("div");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
    heading.textContent = title;

    section.append(heading, content);

    return section;
}

function createActivityRow(
    session,
    memberId
) {
    const row =
        document.createElement("button");

    row.type = "button";

    row.classList.add(
        "pax-activity-row"
    );

    const date =
        document.createElement("div");

    date.classList.add(
        "pax-activity-date"
    );

    date.textContent =
        new Intl.DateTimeFormat(
            undefined,
            {
                month: "short",
                day: "numeric",
            }
        ).format(
            new Date(
                /^\d{4}-\d{2}-\d{2}$/.test(
                    session.date
                )
                    ? `${session.date}T00:00:00`
                    : session.date
            )
        );

    const content =
        document.createElement("div");

    content.classList.add(
        "pax-activity-content"
    );

    const aoName =
        document.createElement("div");

    aoName.classList.add(
        "pax-activity-ao"
    );

    aoName.textContent =
        session.aoName ||
        "Unknown AO";

    const sessionTitle =
        document.createElement("div");

    sessionTitle.classList.add(
        "pax-activity-subtitle"
    );

    sessionTitle.textContent =
        session.title ||
        session.workoutTitle ||
        "";

    content.appendChild(aoName);

    if (sessionTitle.textContent) {
        content.appendChild(sessionTitle);
    }

    const qIds =
        Array.isArray(session.qIds)
            ? session.qIds
            : session.qId
                ? [session.qId]
                : [];

    const role =
        document.createElement("div");

    role.classList.add(
        "pax-activity-role"
    );

    role.textContent =
        qIds.includes(memberId)
            ? "Q"
            : "Post";

    if (qIds.includes(memberId)) {
        role.classList.add(
            "pax-activity-role-q"
        );
    }

    const chevron =
        document.createElement("span");

    chevron.classList.add(
        "pax-activity-chevron"
    );

    chevron.setAttribute(
        "aria-hidden",
        "true"
    );

    chevron.textContent = "›";

    row.append(
        date,
        content,
        role,
        chevron
    );

    row.addEventListener(
        "click",
        () => {
            state.selectedSessionId =
                session.id;

            navigateTo(
                "sessionDetail"
            );
        }
    );

    return row;
}

export function renderPaxProfileView() {
    const app = document.getElementById("app");

    app.textContent = "";
    app.className =
        "view-paxProfile view-paxOverview";
    
    cleanupMainMenu();

    const member = getSelectedMember();

    const isCurrentUser =
        member?.id === state.currentUserMemberId;

    const header = createAppHeader({
        title: isCurrentUser
            ? "My Profile"
            : "PAX Profile",
        showBack: true,
        showMenu: true,
        fallbackView: "dashboard",
    });

    app.appendChild(header);

    if (!member) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No PAX selected.";

        app.append(empty, createGlobalNav());
        return;
    }

    if (!canViewPaxOverview(member.id)) {
        navigateTo("paxCommunity");
        return;
    }

    const stats = getMemberStats(member.id);
    const sessions = getMemberSessions(member.id);

    const profileMemberSince =
        stats?.firstPostDate ||
        sessions.at(-1)?.date ||
        null;

    const memberSinceLabel = profileMemberSince
        ? new Intl.DateTimeFormat(undefined, {
            month: "short",
            year: "numeric",
        }).format(
            new Date(
                /^\d{4}-\d{2}-\d{2}$/.test(profileMemberSince)
                    ? `${profileMemberSince}T00:00:00`
                    : profileMemberSince
            )
        )
        : null;
    
    const titleSection = createProfileIdentity(
        member,
        memberSinceLabel
    );

    const totalPosts = stats?.posts ?? sessions.length;
    const totalQs = stats?.qs ?? 0;
    
    const qScore = calculateQScore({
        posts: totalPosts,
        qs: totalQs,
    });
    
    const overallGrid = document.createElement("div");
    overallGrid.classList.add("pax-overall-grid");
    
    overallGrid.append(
        createMetricCard("Posts", totalPosts),
        createMetricCard("Qs Led", totalQs),
        createMetricCard("Q Score", formatPercentage(qScore)),
        createMetricCard("FNGs EH’d", stats?.fngsEh ?? 0)
    );
    
    const overallSection =
    createSection(
        "Performance",
        overallGrid
    );
    
    const leadershipInsight = getLeadershipInsight({
        posts: totalPosts,
        qs: totalQs,
    });
    
    const leadershipCard = createLeadershipCard(
        leadershipInsight,
        stats
    );
    
    const leadershipSection = document.createElement("div");
    leadershipSection.classList.add("section");
    leadershipSection.appendChild(leadershipCard);
    
    const profileFacts = document.createElement("div");
    profileFacts.classList.add("pax-profile-facts");

    function formatOptionalDate(date) {
        return date ? formatDate(date) : "-";
    }
    
    profileFacts.append(
        createProfileFact(
            "Home AO",
            member.aoName ||
                member.homeAo ||
                member.homeAoName ||
                "-"
        ),
        createProfileFact(
            "First Post",
            formatOptionalDate(
                stats?.firstPostDate ||
                sessions.at(-1)?.date
            )
        ),
        createProfileFact(
            "Last Post",
            formatOptionalDate(
                stats?.lastPostDate ||
                sessions[0]?.date
            )
        ),
        createProfileFact(
            "Last Q",
            formatOptionalDate(
                stats?.lastQDate
            )
        ),
        createProfileFact(
            "Favorite AO",
            stats?.favoriteAo || "-"
        )
    );
    
    const profileSection = createSection("Profile", profileFacts);

    const recentList =
        document.createElement("div");

    recentList.classList.add(
        "pax-activity-list"
    );

    if (!sessions.length) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No recent sessions found.";
        recentList.appendChild(empty);
    } else {
        sessions.slice(0, 12).forEach(session => {
            recentList.appendChild(createActivityRow(session, member.id));
        });
    }

    const recentSection = createSection("Recent Activity", recentList);

    const profileNav = createPaxProfileNav("paxProfile");

    app.append(
        titleSection,
        profileNav,
        overallSection,
        leadershipSection,
        profileSection,
        recentSection,
        createGlobalNav()
    );

    if (member.avatarPath) {
        const selectedMemberId = member.id;
    
        resolveMediaUrl(member.avatarPath)
            .then(avatarUrl => {
                if (!avatarUrl) return;
                if (state.selectedPaxId !== selectedMemberId) return;
    
                const currentIdentity = app.querySelector(".pax-profile-identity");
                if (!currentIdentity) return;
    
                currentIdentity.replaceWith(
                    createProfileIdentity(
                        member,
                        memberSinceLabel,
                        avatarUrl
                    )
                );
            })
            .catch(error => {
                console.warn("Failed to resolve profile avatar:", {
                    memberId: selectedMemberId,
                    error,
                });
            });
    }

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }
}