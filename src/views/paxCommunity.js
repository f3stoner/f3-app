import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { formatDate } from "../utils/date.js";
import { loadMemberCommunityData } from "../services/cloudData.js";
import { createPaxProfileNav } from "../components/paxProfileNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { getMemberById } from "../utils/memberLookup.js";

function getSelectedMember() {
    return getMemberById(
        state.selectedPaxId
    );
}

function createSection(title, content) {
    const section = document.createElement("section");
    section.classList.add("section");

    const heading = document.createElement("div");
    heading.classList.add("insights-section-title");
    heading.textContent = title;

    section.append(heading, content);

    return section;
}

function createSummaryMetric(label, value) {
    const card = document.createElement("div");
    card.classList.add("pax-metric-card");

    const valueEl = document.createElement("div");
    valueEl.classList.add("pax-metric-value");
    valueEl.textContent = value ?? "-";

    const labelEl = document.createElement("div");
    labelEl.classList.add("pax-metric-label");
    labelEl.textContent = label;

    card.append(valueEl, labelEl);

    return card;
}

function createMostPostedWithRow(buddy, rank) {
    const member =
        getMemberById(
            buddy.memberId
        );

    const row = document.createElement("button");
    row.type = "button";
    row.classList.add(
        "pax-community-row",
        "pax-most-posted-with-row"
    );

    const rankEl = document.createElement("div");
    rankEl.classList.add("pax-community-rank");
    rankEl.textContent = String(rank);

    const content = document.createElement("div");
    content.classList.add("pax-community-row-content");

    const name = document.createElement("div");
    name.classList.add("pax-community-row-title");
    name.textContent =
        member?.paxName ||
        member?.displayName ||
        "Unknown PAX";

    const subtitle = document.createElement("div");
    subtitle.classList.add("pax-community-row-subtitle");
    subtitle.textContent = buddy.lastSharedDate
        ? `Most recent: ${formatDate(buddy.lastSharedDate)}`
        : "No recent post available";

    content.append(name, subtitle);

    const value = document.createElement("div");
    value.classList.add("pax-community-row-value");
    value.textContent =
        `${buddy.sharedPosts} workout${buddy.sharedPosts === 1 ? "" : "s"} together`;

    row.append(rankEl, content, value);

    if (member) {
        row.addEventListener("click", () => {
            state.selectedPaxId = member.id;
            navigateTo("paxCommunity");
        });
    } else {
        row.disabled = true;
    }

    return row;
}

function createEhdPaxRow(member) {
    const row = document.createElement("button");
    row.type = "button";
    row.classList.add(
        "pax-community-row",
        "pax-ehd-row"
    );

    const content = document.createElement("div");
    content.classList.add("pax-community-row-content");

    const name = document.createElement("div");
    name.classList.add("pax-community-row-title");
    name.textContent =
        member.paxName ||
        member.displayName ||
        "Unknown PAX";

    const subtitle = document.createElement("div");
    subtitle.classList.add("pax-community-row-subtitle");
    subtitle.textContent = member.firstPostDate
        ? `EH’d ${formatDate(member.firstPostDate)}`
        : "EH date unavailable";

    content.append(name, subtitle);
    row.appendChild(content);

    row.addEventListener("click", () => {
        state.selectedPaxId = member.id;
        navigateTo("paxCommunity");
    });

    return row;
}

function createAoRow(ao) {
    const row = document.createElement("div");
    row.classList.add("pax-community-row");

    const content = document.createElement("div");
    content.classList.add("pax-community-row-content");

    const title = document.createElement("div");
    title.classList.add("pax-community-row-title");
    title.textContent = ao.aoName || "Unknown AO";

    const subtitle = document.createElement("div");
    subtitle.classList.add("pax-community-row-subtitle");
    subtitle.textContent = ao.lastPostDate
        ? `Last post ${formatDate(ao.lastPostDate)}`
        : "";

    content.append(title, subtitle);

    const value = document.createElement("div");
    value.classList.add("pax-community-row-value");
    value.textContent = `${ao.posts} post${ao.posts === 1 ? "" : "s"}`;

    row.append(content, value);

    return row;
}

function createRelationshipRow(label, value, onClick = null) {
    const row = document.createElement(
        onClick ? "button" : "div"
    );

    if (onClick) {
        row.type = "button";
    }

    row.classList.add(
        "pax-profile-fact",
        "pax-community-relationship-row"
    );

    const labelEl = document.createElement("div");
    labelEl.classList.add("pax-profile-fact-label");
    labelEl.textContent = label;

    const valueEl = document.createElement("div");
    valueEl.classList.add("pax-profile-fact-value");
    valueEl.textContent = value || "-";

    row.append(labelEl, valueEl);

    if (onClick) {
        row.addEventListener("click", onClick);
    }

    return row;
}

export async function renderPaxCommunityView() {
    const app = document.getElementById("app");
    app.textContent = "";

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

    const identity = document.createElement("div");
    identity.classList.add("pax-profile-identity");

    const name = document.createElement("h1");
    name.textContent =
        member.paxName ||
        member.displayName ||
        "Unnamed PAX";

    identity.appendChild(name);

    const profileNav = createPaxProfileNav("paxCommunity");

    const loading = document.createElement("div");
    loading.classList.add(
        "detail-value",
        "pax-community-loading"
    );
    loading.textContent = "Loading community history…";

    app.append(
        identity,
        profileNav,
        loading,
        createGlobalNav()
    );

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }

    try {
        const cacheKey =
            `${state.currentRegionId}__${member.id}`;

        state.memberCommunityByMemberId =
            state.memberCommunityByMemberId || {};

        let community =
            state.memberCommunityByMemberId[cacheKey];

        if (!community) {
            community = await loadMemberCommunityData(
                state.currentRegionId,
                member.id
            );

            state.memberCommunityByMemberId[cacheKey] =
                community;
        }

        if (
            state.currentView !== "paxCommunity" ||
            state.selectedPaxId !== member.id
        ) {
            return;
        }

        loading.remove();

        const summaryGrid = document.createElement("div");
        summaryGrid.classList.add("pax-overall-grid");

        summaryGrid.append(
            createSummaryMetric(
                "PAX Posted With",
                community.uniquePaxCount
            ),
            createSummaryMetric(
                "AOs Visited",
                community.uniqueAoCount
            )
        );

        const summarySection =
            createSection("Community", summaryGrid);

        const buddyList = document.createElement("div");
        buddyList.classList.add(
            "pax-community-list",
            "pax-most-posted-with-list"
        );

        const visibleBuddies =
            community.battleBuddies.slice(0, 5);

        if (visibleBuddies.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent =
                "No shared workout history found.";

            buddyList.appendChild(empty);
        } else {
            visibleBuddies.forEach((buddy, index) => {
                buddyList.appendChild(
                    createMostPostedWithRow(
                        buddy,
                        index + 1
                    )
                );
            });
        }

        const buddiesSection =
            createSection("Most Posted With", buddyList);

        const inviterIds =
            member.inviterIds?.length
                ? member.inviterIds
                : member.invitedById
                    ? [member.invitedById]
                    : [];
        
        const proudPapas = state.members
            .filter(candidate =>
                inviterIds.includes(candidate.id)
            )
            .sort((a, b) =>
                (a.paxName || "").localeCompare(b.paxName || "")
            );
        
        const ehdPax = state.members
            .filter(candidate => {
                const candidateInviterIds =
                    candidate.inviterIds?.length
                        ? candidate.inviterIds
                        : candidate.invitedById
                            ? [candidate.invitedById]
                            : [];
        
                return candidateInviterIds.includes(member.id);
            })
            .sort((a, b) =>
                String(a.firstPostDate || "")
                    .localeCompare(String(b.firstPostDate || ""))
            );

        const relationships = document.createElement("div");
        relationships.classList.add("pax-family-card");
        
        const proudPapaBlock = document.createElement("div");
        proudPapaBlock.classList.add("pax-family-block");
        
        const proudPapaLabel = document.createElement("div");
        proudPapaLabel.classList.add("pax-family-label");
        proudPapaLabel.textContent = "Proud Papas";
        
        const proudPapaList = document.createElement("div");
        proudPapaList.classList.add("pax-family-list");
        
        if (proudPapas.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("pax-family-empty");
            empty.textContent = "No Proud Papas recorded.";
        
            proudPapaList.appendChild(empty);
        } else {
            proudPapas.forEach(candidate => {
                const row = document.createElement("button");
                row.type = "button";
                row.classList.add("pax-family-person-row");
        
                const name = document.createElement("span");
                name.classList.add("pax-family-person-name");
                name.textContent =
                    candidate.paxName ||
                    candidate.displayName ||
                    "Unknown PAX";
        
                row.appendChild(name);
        
                row.addEventListener("click", () => {
                    state.selectedPaxId = candidate.id;
                    navigateTo("paxCommunity");
                });
        
                proudPapaList.appendChild(row);
            });
        }
        
        proudPapaBlock.append(
            proudPapaLabel,
            proudPapaList
        );

        const ehdBlock = document.createElement("div");
        ehdBlock.classList.add(
            "pax-family-block",
            "pax-family-ehd-block"
        );
        
        const ehdHeading = document.createElement("div");
        ehdHeading.classList.add("pax-family-heading-row");
        
        const ehdLabel = document.createElement("div");
        ehdLabel.classList.add("pax-family-label");
        ehdLabel.textContent = "PAX EH’d";
        
        const ehdCount = document.createElement("div");
        ehdCount.classList.add("pax-family-count");
        ehdCount.textContent = ehdPax.length;
        
        ehdHeading.append(ehdLabel, ehdCount);
        ehdBlock.appendChild(ehdHeading);
        
        if (ehdPax.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("pax-family-empty");
            empty.textContent = "No EH relationships recorded.";
        
            ehdBlock.appendChild(empty);
        } else {
            const ehdList = document.createElement("div");
            ehdList.classList.add("pax-family-list");
        
            const renderEhdPax = expanded => {
                ehdList.textContent = "";
        
                const visiblePax = expanded
                    ? ehdPax
                    : ehdPax.slice(0, 3);
        
                visiblePax.forEach(candidate => {
                    const row = document.createElement("button");
                    row.type = "button";
                    row.classList.add("pax-family-person-row");
        
                    const name = document.createElement("span");
                    name.classList.add("pax-family-person-name");
                    name.textContent =
                        candidate.paxName ||
                        candidate.displayName ||
                        "Unknown PAX";
        
                    const date = document.createElement("span");
                    date.classList.add("pax-family-person-date");
                    date.textContent = candidate.firstPostDate
                        ? formatDate(candidate.firstPostDate)
                        : "Date unavailable";
        
                    row.append(name, date);
        
                    row.addEventListener("click", () => {
                        state.selectedPaxId = candidate.id;
                        navigateTo("paxCommunity");
                    });
        
                    ehdList.appendChild(row);
                });
        
                if (ehdPax.length > 3) {
                    const toggle = document.createElement("button");
                    toggle.type = "button";
                    toggle.classList.add("pax-family-toggle");
                    toggle.textContent = expanded
                        ? "Show fewer"
                        : `View all ${ehdPax.length}`;
        
                    toggle.addEventListener("click", () => {
                        renderEhdPax(!expanded);
                    });
        
                    ehdList.appendChild(toggle);
                }
            };
        
            renderEhdPax(false);
            ehdBlock.appendChild(ehdList);
        }
        
        relationships.append(
            proudPapaBlock,
            ehdBlock
        );
        
        const relationshipsSection =
            createSection("F3 Family", relationships);
            
        const aoList = document.createElement("div");
        aoList.classList.add("pax-community-list");

        const visibleAos =
            community.sharedAos.slice(0, 5);

        if (visibleAos.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("detail-value");
            empty.textContent = "No AO history found.";

            aoList.appendChild(empty);
        } else {
            visibleAos.forEach(ao => {
                aoList.appendChild(createAoRow(ao));
            });
        }

        const aosSection =
            createSection("AO Activity", aoList);

        const nav = app.querySelector(".global-nav");

        app.insertBefore(summarySection, nav);
        app.insertBefore(buddiesSection, nav);
        app.insertBefore(relationshipsSection, nav);
        app.insertBefore(aosSection, nav);

    } catch (error) {
        console.error(
            "Failed to load PAX community:",
            error
        );

        loading.textContent =
            "Unable to load community history.";
    }
}