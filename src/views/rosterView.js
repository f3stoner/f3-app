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

function memberMatchesRosterFilter(member) {
  if (!state.rosterFilter) return true;

  if (state.rosterFilter.type === "active-pax") {
    return state.sessions.some(session => {
      const isInRange =
        session.date >= state.rosterFilter.startDate &&
        session.date <= state.rosterFilter.endDate;

        const attended =
          Array.isArray(session.attendeeIds) &&
          session.attendeeIds.includes(member.id);

        return isInRange && attended;
    });
  }

  if (state.rosterFilter.type === "active-qs") {
    return state.sessions.some(session => {
      const isInRange =
        session.date >= state.rosterFilter.startDate &&
        session.date <= state.rosterFilter.endDate;

      const qIds = Array.isArray(session.qIds)
       ? session.qIds
       : session.qId
        ? [session.qId]
        : [];

      return isInRange && qIds.includes(member.id);
    });
  }

  if (state.rosterFilter.type === "posting-frequency") {
    const posts = state.sessions.filter(session => {
      const isInRange =
          session.date >= state.rosterFilter.startDate &&
          session.date <= state.rosterFilter.endDate;
      const attended =
          Array.isArray(session.attendeeIds) &&
          session.attendeeIds.includes(member.id);
      return isInRange && attended;
  }).length;

    switch (state.rosterFilter.bucket) {
      case "1":
      case "one":
      case "1 Post":
        return posts === 1;
      case "2-4":
      case "2-4 Posts":
        return posts >= 2 && posts <= 4;
      case "5-9":
      case "5-9 Posts":
        return posts >= 5 && posts <= 9;
      case "10-19":
      case "10-19 Posts":
        return posts >= 10 && posts <= 19;
      case "20+":
      case "20+ Posts":
      case "20-plus":
        return posts >= 20;
      default:
        return true;
    }
  }

  return true;
}

function getVisibleRosterMembers() {
  const searchTerm = (state.rosterSearchTerm || "").trim().toLowerCase();

  const filteredMembers = state.members.filter((member) => {
    if (!memberMatchesRosterFilter(member)) return false;

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

  return [...filteredMembers].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
    }

    const aName = getMemberDisplayName(a).toLowerCase();
    const bName = getMemberDisplayName(b).toLowerCase();

    return aName.localeCompare(bName);
  });
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
    renderRosterList(rosterContainer, getVisibleRosterMembers());
  });

  renderRosterList(rosterContainer, getVisibleRosterMembers());

  const backButton = document.createElement("button");
  backButton.textContent = "Back to Dashboard";
  backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
  });

  const nav = createGlobalNav();

  let activeFilterNotice = null;

  if (state.rosterFilter) {
    activeFilterNotice = document.createElement("div");
    activeFilterNotice.classList.add("section");

    const filterText = document.createElement("div");
    filterText.classList.add("detail-value");

    if (state.rosterFilter.type === "posting-frequency") {
      filterText.textContent = `Showing PAX in posting bucket: ${state.rosterFilter.label || state.rosterFilter.bucket}`;
    } else {
      filterText.textContent = state.rosterFilter.label;
    }

    const clearButton = document.createElement("button");
    clearButton.classList.add("secondary-button");
    clearButton.textContent = "Clear Filter";

    clearButton.addEventListener("click", () => {
      state.rosterFilter = null;
      renderRoster();
    });

    activeFilterNotice.append(filterText, clearButton);
  }

  if (activeFilterNotice) {
    app.append(title, activeFilterNotice, searchInput, rosterContainer, backButton, nav);
  } else {
    app.append(title, searchInput, rosterContainer, backButton, nav);
  }

}