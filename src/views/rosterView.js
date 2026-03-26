import { renderApp } from "../index.js";
import { state } from "../modules/state.js";

export function renderRoster() {
  const app = document.getElementById("app");
  app.textContent = "";

  const title = document.createElement("h1");
  title.textContent = "Roster";

  const ul = document.createElement("ul");

  state.members.forEach((member) => {
    const li = document.createElement("li");
    li.textContent = member.paxName;
    ul.appendChild(li);
  });

  const backButton = document.createElement("button");
  backButton.textContent = "Back to Dashboard";
  backButton.addEventListener("click", () => {
    state.currentView = "dashboard";
    renderApp();
  });

  app.appendChild(title);
  app.appendChild(ul);
  app.appendChild(backButton);
}