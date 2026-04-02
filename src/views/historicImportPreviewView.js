import { state } from "../modules/state.js";
import { renderApp } from "../index.js";

export function renderHistoricImportPreview(previewResult, convertedResult) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <div class="view">
            <h2>Historic Import Preview</h2>

            <p><strong>Sessions:</strong> ${convertedResult.sessions.length}</p>
            <p><strong>Missing Pax:</strong> ${convertedResult.missingPax.length}</p>

            <button id="confirmImport">Import Sessions</button>
            <button id="cancelImport">Cancel</button>
        </div>
    `;

    document.getElementById("confirmImport").addEventListener("click", async () => {
        console.log("IMPORTING...");
        await state.runHistoricImport();
        renderApp();
    });

    document.getElementById("cancelImport").addEventListener("click", () => {
        renderApp();
    });
}