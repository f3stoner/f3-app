import { renderApp } from "../index.js";
import { state } from "../modules/state.js";
import { getMemberStats } from "../modules/stats.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";
import { navigateTo } from "../utils/navigation.js";

function renderRosterList(rosterContainer, members) {
    rosterContainer.textContent = "";

    let currentLetter = null;

    members.forEach((member) => {
        const displayName = getMemberDisplayName(member);
        const firstLetter = displayName.charAt(0).toUpperCase();

        if (firstLetter !== currentLetter) {
            currentLetter = firstLetter;

            const letterHeader = document.createElement("div");
            letterHeader.classList.add("roster-letter-header");
            letterHeader.textContent = currentLetter;

            rosterContainer.appendChild(letterHeader);
        }
        const memberCard = document.createElement("div");
        memberCard.classList.add("member-card");
        if (member.status === "inactive") {
            memberCard.classList.add("member-card-inactive");
        }
        const paxName = document.createElement("div");
        paxName.classList.add("member-name");
        paxName.textContent = displayName;
        let statusBadge = null;

        if (member.status === "inactive") {
            statusBadge = document.createElement("div");
            statusBadge.classList.add("member-status-badge");
            statusBadge.textContent = "Inactive";
        }
        const statsLine = document.createElement("div");
        statsLine.classList.add("stats-line");
        const memberStats = getMemberStats(member.id);
        const lastPost = memberStats.lastPostDate? formatDate(memberStats.lastPostDate): "-";
        statsLine.textContent = `Posts: ${memberStats.posts} - Qs: ${memberStats.qs} - Last: ${lastPost}`;

        memberCard.addEventListener("click", () => {
            state.selectedMemberId = member.id;
            navigateTo("memberDetail");
        })

        rosterContainer.appendChild(memberCard);
        if (statusBadge) {
            memberCard.append(paxName, statusBadge, statsLine);
        } else {
            memberCard.append(paxName, statsLine);
        }
    });

    if (members.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.classList.add("detail-value");
        emptyState.textContent = "No matching PAX found";
        rosterContainer.appendChild(emptyState);
    }

}

export function renderRoster() {
  const app = document.getElementById("app");
  app.textContent = "";

  const title = document.createElement("h1");
  title.textContent = "Roster";

  const rosterContainer = document.createElement("div");

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search PAX...";
  searchInput.value = state.rosterSearchTerm || "";
  searchInput.classList.add("session-search");

  searchInput.addEventListener("input", (event) => {
    state.rosterSearchTerm = event.target.value;

    const searchTerm = (state.rosterSearchTerm || "").trim().toLowerCase();

  const filteredMembers = state.members.filter((member) => {
    if (!searchTerm) return true;

    const displayName = getMemberDisplayName(member).toLowerCase();
    const realName = (member.realName || "").toLowerCase();
    const homeAo = (member.homeAo || "").toLowerCase();

    return (
        displayName.includes(searchTerm) ||
        realName.includes(searchTerm) ||
        homeAo.includes(searchTerm)
    );
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (a.status !== b.status) {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
    }

    const aName = getMemberDisplayName(a).toLowerCase();
    const bName = getMemberDisplayName(b).toLowerCase();

    return aName.localeCompare(bName);
  });

    renderRosterList(rosterContainer, sortedMembers);
  });

  const searchTerm = (state.rosterSearchTerm || "").trim().toLowerCase();

  const filteredMembers = state.members.filter((member) => {
    if (!searchTerm) return true;

    const displayName = getMemberDisplayName(member).toLowerCase();
    const realName = (member.realName || "").toLowerCase();
    const homeAo = (member.homeAo || "").toLowerCase();

    return (
        displayName.includes(searchTerm) ||
        realName.includes(searchTerm) ||
        homeAo.includes(searchTerm)
    );
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (a.status !== b.status) {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
    }

    const aName = getMemberDisplayName(a).toLowerCase();
    const bName = getMemberDisplayName(b).toLowerCase();

    return aName.localeCompare(bName);
  });

  renderRosterList(rosterContainer, sortedMembers);

  const backButton = document.createElement("button");
  backButton.textContent = "Back to Dashboard";
  backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
  });

  const nav = createGlobalNav();

  app.append(title, searchInput, rosterContainer, backButton, nav);
}