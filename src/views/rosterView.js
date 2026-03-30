import { renderApp } from "../index.js";
import { state } from "../modules/state.js";
import { getMemberStats } from "../modules/stats.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";

export function renderRoster() {
  const app = document.getElementById("app");
  app.textContent = "";

  const title = document.createElement("h1");
  title.textContent = "Roster";

  const rosterContainer = document.createElement("div");

  const sortedMembers = [...state.members].sort((a, b) => {
    if (a.status !== b.status) {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
    }

    const aName = getMemberDisplayName(a).toLowerCase();
    const bName = getMemberDisplayName(b).toLowerCase();

    return aName.localeCompare(bName);
  });

  sortedMembers.forEach((member) => {
    const memberCard = document.createElement("div");
    memberCard.classList.add("member-card");
    const paxName = document.createElement("div");
    paxName.textContent = getMemberDisplayName(member);
    const statsLine = document.createElement("div");
    statsLine.classList.add("stats-line");
    const memberStats = getMemberStats(member.id);
    const lastPost = memberStats.lastPostDate? formatDate(memberStats.lastPostDate): "-";
    statsLine.textContent = `Posts: ${memberStats.posts} - Qs: ${memberStats.qs} - Last: ${lastPost}`

    memberCard.addEventListener("click", () => {
        state.selectedMemberId = member.id;
        state.currentView = "memberDetail";
        renderApp();
    })

    rosterContainer.appendChild(memberCard);
    memberCard.append(paxName, statsLine);
  });

  const backButton = document.createElement("button");
  backButton.textContent = "Back to Dashboard";
  backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
  });

  const nav = createGlobalNav();

  app.append(title, rosterContainer, backButton, nav);
}