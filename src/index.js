import { state } from "./modules/state.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderRoster } from "./views/rosterView.js";
import { renderSession } from "./views/sessionView.js";
import "./styles/main.css";

function renderApp() {
    if (state.currentView === "roster") {
        renderRoster();
    } else if (state.currentView === "session"){
        renderSession();
    } else {
        renderDashboard ();
    }
}

renderApp();

export { renderApp };