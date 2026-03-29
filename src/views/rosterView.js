import { renderApp } from "../index.js";
import { state } from "../modules/state.js";
import { getMemberStats } from "../modules/stats.js";
import { formatDate } from "../utils/date.js";

export function renderRoster() {
  const app = document.getElementById("app");
  app.textContent = "";

  const title = document.createElement("h1");
  title.textContent = "Roster";

  const rosterContainer = document.createElement("div");

  state.members.forEach((member) => {
    const memberCard = document.createElement("div");
    memberCard.classList.add("member-card");
    const paxName = document.createElement("div");
    paxName.textContent = member.paxName;
    const statsLine = document.createElement("div");
    statsLine.classList.add("stats-line");
    const memberStats = getMemberStats(member.id);
    const lastPost = memberStats.lastPostDate? formatDate(memberStats.lastPostDate): "-";
    statsLine.textContent = `Posts: ${memberStats.posts} - Qs: ${memberStats.qs} - Last: ${lastPost}`
    rosterContainer.appendChild(memberCard);
    memberCard.append(paxName, statsLine);
  });

  const backButton = document.createElement("button");
  backButton.textContent = "Back to Dashboard";
  backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
  });

  app.appendChild(title);
  app.appendChild(rosterContainer);
  app.appendChild(backButton);
}