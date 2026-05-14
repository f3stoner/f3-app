import { state } from "../modules/state.js";
import { renderApp } from "../index.js";
import { createGlobalNav } from "../components/globalNav.js";
import { updateMember } from "../services/appData.js";
import { formatDate } from "../utils/date.js";
import { goBack } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

export function renderStalePaxView() {
    const app = document.getElementById("app");
    app.textContent = "";

    const title = document.createElement("h1");
    title.textContent = "Stale PAX Review";

    const controlsRow = document.createElement("div");
    controlsRow.classList.add("button-row");

    const thresholdSelect = document.createElement("select");
    [90, 180, 365].forEach(days => {
        const option = document.createElement("option");
        option.value = String(days);
        option.textContent = `${days}+ days`;
        if (state.stalePaxThresholdDays === days) {
            option.selected = true;
        }
        thresholdSelect.appendChild(option);
    });

    thresholdSelect.addEventListener("input", (event) => {
        state.stalePaxThresholdDays = event.target.value;
        renderStalePaxList();
    });

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search stale PAX...";
    searchInput.classList.add("session-search");
    searchInput.value = state.stalePaxSearchTerm || "";
    
    searchInput.addEventListener("input", (event) => {
        state.stalePaxSearchTerm = event.target.value;
        renderStalePaxList();
    });
    
    controlsRow.append(thresholdSelect, searchInput);

    const stalePaxList = document.createElement("div");

    function getLastPostDate(member) {
        const matchingSessions = state.sessions.filter(session => 
            session.attendeeIds.includes(member.id) ||
            session.fngs?.some(fng => fng.memberId === member.id)
        );

        if (matchingSessions.length === 0) {
            return member.firstPostDate || null;
        }

        return matchingSessions
            .map(session => session.date)
            .sort()
            .at(-1);
    }

    function isStale(lastPostDate, thresholdDays) {
        if (!lastPostDate) return true;

        const lastPost = new Date(lastPostDate);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - thresholdDays);

        return lastPost < cutoff;
    }

    function renderStalePaxList() {
        stalePaxList.textContent = "";

        const searchTerm = (state.stalePaxSearchTerm || "").trim().toLowerCase();
        const thresholdDays = state.stalePaxThresholdDays || 180;

        const rows = state.members
            .map(member => ({
                member,
                lastPostDate: getLastPostDate(member),
            }))
            .filter(({ member, lastPostDate }) => {
                const needsReview = !lastPostDate && member.firstPostDate;
                if (member.status !== "active") return false;
                if (!isStale(lastPostDate, thresholdDays) && !needsReview) return false;

                if (!searchTerm) return true;

                return (
                    (member.paxName || "").toLowerCase().includes(searchTerm) ||
                    (member.realName || "").toLowerCase().includes(searchTerm) ||
                    (member.homeAo || "").toLowerCase().includes(searchTerm)
                );
            })
            .sort((a, b) => {
                const aDate = a.lastPostDate || "";
                const bDate = b.lastPostDate || "";
                const aNeedsReview = !a.lastPostDate && a.member.firstPostDate;
                const bNeedsReview = !b.lastPostDate && b.member.firstPostDate;

                if (aNeedsReview !== bNeedsReview) {
                    return aNeedsReview ? -1 : 1;                    
                }

                if (aDate !== bDate) {
                    return aDate.localeCompare(bDate); // oldest first
                }

                return a.member.paxName.localeCompare(b.member.paxName);
            });

        if (rows.length === 0) {
            stalePaxList.textContent = "No stale active PAX found.";
            return;
        }

        rows.forEach(({ member, lastPostDate }) => {
            const card = document.createElement("div");
            card.classList.add("member-card", "session-history-card");

            const nameLine = document.createElement("div");
            nameLine.classList.add("member-name");
            nameLine.textContent = member.paxName;

            const detailLine = document.createElement("div");
            detailLine.classList.add("stats-line");
            detailLine.textContent = `${member.realName || "-"} • ${member.homeAo || "No AO"}`;

            const lastPostLine = document.createElement("div");
            lastPostLine.classList.add("stats-line");
            const needsReview = !lastPostDate && member.firstPostDate;
            lastPostLine.textContent = needsReview
                ? `Last post: Unknown • First post: ${formatDate(member.firstPostDate)}`
                : `Last post: ${lastPostDate ? formatDate(lastPostDate) : "Never"}`;
            
            let reviewLine = null;

            if (needsReview) {
                reviewLine = document.createElement("div");
                reviewLine.classList.add("stats-line");
                reviewLine.textContent = "⚠️ Needs Review";
            }

            const actionRow = document.createElement("div");
            actionRow.classList.add("button-row");

            const inactiveButton = document.createElement("button");
            inactiveButton.textContent = "Mark Inactive";

            inactiveButton.addEventListener("click", async () => {
                try {
                    await updateMember(member.id, {
                        ...member,
                        status: "inactive",
                    });
                    renderStalePaxList();
                } catch (error) {
                    console.error("Failed to update member status:", error);
                    showToast("Failed to update member.", "error");
                }
            });

            actionRow.append(inactiveButton);
            card.append(nameLine, detailLine, lastPostLine, ...(reviewLine ? [reviewLine] : []), actionRow);
            stalePaxList.appendChild(card);
        });
    }

    const backButton = document.createElement("button");
    backButton.textContent = "← Back";
    backButton.classList.add("secondary-button");
    backButton.addEventListener("click", () => {
        goBack("adminSettings");
    });

    const nav = createGlobalNav();

    renderStalePaxList();

    const header = document.createElement("div");
    header.classList.add("view-header");
    header.append(backButton, title);

    app.append(header, controlsRow, stalePaxList, nav);
}