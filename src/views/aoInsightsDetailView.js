import { state } from "../modules/state.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { navigateTo } from "../utils/navigation.js";
import { loadAoInsightSessions } from "../services/cloudData.js";
import { renderAttendanceDetail } from "../components/aoInsights/attendanceDetail.js";
import { renderNewPaxPipelineDetail } from "../components/aoInsights/newPaxPipelineDetail.js";

const AO_INSIGHT_DETAIL_LOOKBACK_DAYS = 180;

export async function renderAoInsightDetailView() {
    const app = document.getElementById("app");

    const selected = state.selectedAoInsights;
    const detailType = state.selectedAoInsightDetail;

    const header = createAppHeader({
        title: "Insight Detail",
        showBack: true,
        showMenu: true,
        fallbackView: "aoInsights",
    });

    app.textContent = "";
    app.appendChild(header);

    if (!selected || !detailType) {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "No insight selected.";

        const backButton = document.createElement("button");
        backButton.textContent = "Back to AO Insights";
        backButton.addEventListener("click", () => {
            navigateTo("aoInsights");
        });

        app.append(empty, backButton, createGlobalNav());
        return;
    }

    const anchorDate = new Date(`${selected.endDate}T00:00:00`);
    const historyStartDate = new Date(anchorDate);

    historyStartDate.setDate(historyStartDate.getDate() - AO_INSIGHT_DETAIL_LOOKBACK_DAYS);
    
    const sessions = await loadAoInsightSessions({
        regionId: state.currentRegionId,
        aoName: selected.aoName,
        startDate: historyStartDate.toISOString().slice(0, 10),
        endDate: selected.endDate,
    });

    if (detailType === "attendance") {
        renderAttendanceDetail({ app, selected, sessions });
    } else if (detailType === "newPaxPipeline") {
        renderNewPaxPipelineDetail({ app, selected, sessions });
    } else {
        const empty = document.createElement("div");
        empty.classList.add("detail-value");
        empty.textContent = "This insight detail is not available yet.";
        app.appendChild(empty);
    }

    app.appendChild(createGlobalNav());
}