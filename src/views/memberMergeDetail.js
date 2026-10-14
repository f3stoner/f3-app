import { createAppHeader } from "../components/appHeader.js";
import {
    loadMemberMerge,
    previewMemberMerge,
    markMemberMergeReady,
    executeMemberMerge,
    cancelMemberMerge,
} from "../services/cloudData.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { state } from "../modules/state.js";

export async function renderMemberMergeDetailView(
    params = {}
) {

    const returnView = params.returnView === "rosterManagement" ? "rosterManagement" : "operationsCenter";

    const app =
        document.getElementById("app");

    app.textContent = "";
    app.className = "view-member-merge-detail";

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: returnView,
        showMenu: true,
    });

    app.appendChild(header);

    if (!params.mergeId) {
        showToast(
            "Missing merge id.",
            "error"
        );
        navigateTo(returnView);
        return;
    }

    let merge;

    try {
        merge =
            await loadMemberMerge(
                params.mergeId
            );
    } catch (error) {
        console.error(error);

        showToast(
            "Unable to load merge.",
            "error"
        );

        navigateTo(returnView);
        return;
    }

    if (!merge) {
        showToast(
            "Merge not found.",
            "error"
        );
    
        navigateTo(returnView);
        return;
    }
    
    renderMerge(app, merge, returnView);
}

function renderMerge(container, data, returnView) {
    const title = document.createElement("h1");
    title.textContent = "Merge PAX";

    const subtitle = document.createElement("p");
    subtitle.classList.add("view-subtitle");
    subtitle.textContent = "Review the records and merge impact before completing this merge.";

    container.append(title, subtitle);
    container.appendChild(createMergeStatusSection(data.merge));
    container.appendChild(createMemberCard("Keep This PAX", data.canonicalMember));

    const direction = document.createElement("div");
    direction.classList.add("member-merge-direction");
    direction.textContent = "↑ Merges into ↑";
    container.appendChild(direction);

    container.appendChild(createMemberCard("Remove Duplicate", data.duplicateMember));
    container.appendChild(createManifestSection(data.merge.preview_payload));
    container.appendChild(createMergeActions(data, returnView));
    container.appendChild(createTechnicalDetails(data));
}

function createMergeStatusSection(merge) {
    const section = document.createElement("section");
    section.classList.add("operations-section");

    const title = document.createElement("h2");
    title.textContent = "Merge Status";

    const status = document.createElement("div");
    status.classList.add("stats-line");
    status.textContent = `Status: ${formatMergeStatus(merge.status)}`;

    let detailText = "";

    if (merge.status === "draft") {
        detailText = "Preview and validate this merge before it can be approved.";
    } else if (merge.status === "validated") {
        const readiness = merge.preview_payload?.plan?.readiness || null;
        
        if (readiness?.readyForApproval) {
            detailText = "Preview is clean and ready for approval.";
        } else {
            detailText =
                `Review required · ` +
                `${Number(readiness?.requiredDecisionCount || 0)} decisions · ` +
                `${Number(readiness?.warningCount || 0)} warnings · ` +
                `${Number(readiness?.blockerCount || 0)} blockers`;
        }
    } else if (merge.status === "ready") {
        detailText = "The merge is approved and ready to execute.";
    } else if (merge.status === "running") {
        detailText = "The merge is currently executing.";
    } else if (merge.status === "completed") {
        detailText = "The merge has completed.";
    } else if (merge.status === "failed") {
        detailText = merge.failure_message || "The merge failed.";
    } else if (merge.status === "cancelled") {
        detailText = "The merge was cancelled.";
    }

    const detail = document.createElement("div");
    detail.classList.add("stats-line");
    detail.textContent = detailText;

    section.append(title, status, detail);

    return section;
}

function formatMergeStatus(status) {
    return String(status || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, character => character.toUpperCase());
}

function createMemberCard(titleText, member) {
    const section = document.createElement("section");
    section.classList.add("operations-section", "member-merge-card");

    const title = document.createElement("h2");
    title.textContent = titleText;

    const name = document.createElement("div");
    name.classList.add("member-name");
    name.textContent = member.pax_name || "Unnamed PAX";

    const realName = document.createElement("div");
    realName.classList.add("stats-line");
    realName.textContent = member.real_name || "No real name recorded";

    const homeAo = document.createElement("div");
    homeAo.classList.add("stats-line");
    homeAo.textContent = `Home AO: ${member.home_ao || "Not assigned"}`;

    const status = document.createElement("div");
    status.classList.add("stats-line");
    status.textContent = `Status: ${formatMergeStatus(member.status)}`;

    section.append(title, name, realName, homeAo, status);
    return section;
}

function createManifestSection(previewPayload) {
    const section = document.createElement("section");
    section.classList.add("operations-section", "member-merge-validation");

    const title = document.createElement("h2");
    title.textContent = "Merge Impact & Validation";
    section.appendChild(title);

    if (!previewPayload?.plan) {
        const message = document.createElement("p");
        message.textContent = "Generate a preview to see the merge impact and validation results.";
        section.appendChild(message);
        return section;
    }

    const plan = previewPayload.plan;
    const readiness = plan.readiness;

    if (!readiness) {
        const message = document.createElement("p");
        message.textContent = "Validation results are unavailable. Review technical details before proceeding.";
        section.appendChild(message);
        return section;
    }

    const results = [
        ["Required decisions", readiness.requiredDecisionCount],
        ["Warnings", readiness.warningCount],
        ["Blockers", readiness.blockerCount],
        ["Duplicate Q assignments", plan.qSlots?.duplicateAssignedCount],
    ];
    
    const grid = document.createElement("div");
    grid.classList.add("member-merge-metrics");
    
    results.forEach(([label, value]) => {
        const cell = document.createElement("div");
        cell.classList.add("member-merge-metric");
    
        const number = document.createElement("strong");
        number.textContent = String(value ?? "—");
    
        const caption = document.createElement("span");
        caption.textContent = label;
    
        cell.append(number, caption);
        grid.appendChild(cell);
    });
    
    section.appendChild(grid);

    const issues = [
        ["Required Decisions", plan.requiredDecisions],
        ["Warnings", plan.warnings],
        ["Blockers", plan.blockers],
    ];
    
    issues.forEach(([heading, items]) => {
        if (!Array.isArray(items) || !items.length) return;
    
        const group = document.createElement("div");
        group.classList.add("member-merge-review-group");
    
        const label = document.createElement("h3");
        label.textContent = heading;
        group.appendChild(label);
    
        items.forEach(item => {
            const detail = document.createElement("pre");
            detail.style.whiteSpace = "pre-wrap";
            detail.style.overflowWrap = "anywhere";
            detail.textContent = JSON.stringify(item, null, 2);
            group.appendChild(detail);
        });
    
        section.appendChild(group);
    });

    const status = document.createElement("p");
    status.textContent = readiness.analysisComplete !== true
        ? "Validation is incomplete."
        : readiness.readyForApproval === true
            ? "Validation indicates this merge is ready for approval."
            : "This merge requires additional review before approval.";

    section.appendChild(status);
    return section;
}

function createTechnicalDetails(data) {
    const details = document.createElement("details");
    details.classList.add("operations-section");

    const summary = document.createElement("summary");
    summary.textContent = "Technical Details";

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify({
        canonicalMember: data.canonicalMember,
        duplicateMember: data.duplicateMember,
        preview: data.merge.preview_payload,
    }, null, 2);

    pre.style.whiteSpace = "pre-wrap";
    pre.style.overflowWrap = "anywhere";

    details.append(summary, pre);
    return details;
}

function createMergeActions(data, returnView) {
    const actions = document.createElement("div");
    actions.classList.add("button-row");
    actions.classList.add("member-merge-actions");

    if (
        data.merge.status === "draft" ||
        data.merge.status === "validated"
    ) {
        actions.appendChild(createPreviewButton(data, returnView));
    }

    if (data.merge.status === "validated") {
        actions.appendChild(createMarkReadyButton(data, returnView));
    }

    if (["draft", "validated", "ready", "failed"].includes(data.merge.status)) {
        actions.appendChild(createCancelButton(data, returnView));
    }

    actions.appendChild(createExecuteButton(data, returnView));

    return actions;
}

function createCancelButton(data, returnView) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("secondary-button");
    button.textContent = "Cancel Merge";

    button.addEventListener("click", async () => {
        if (!window.confirm("Cancel this merge? No member records will be changed, and you can start a new merge afterward.")) return;

        button.disabled = true;
        button.textContent = "Cancelling…";

        try {
            await cancelMemberMerge(data.merge.id, "Cancelled by administrator");

            showToast("Merge cancelled.", "success");
            navigateTo(returnView);
        } catch (error) {
            console.error("Failed to cancel member merge:", error);
            showToast(error?.message || "Unable to cancel merge.", "error");
            button.disabled = false;
            button.textContent = "Cancel Merge";
        }
    });

    return button;
}

function createPreviewButton(data, returnView) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent =
        data.merge.status === "validated"
            ? "Refresh Preview"
            : "Preview Merge";

    button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Generating Preview…";

        try {
            await previewMemberMerge(data.merge.id);

            showToast(
                "Merge preview generated.",
                "success"
            );

            renderMemberMergeDetailView({
                mergeId: data.merge.id,
                returnView,
            });
        } catch (error) {
            console.error(
                "Failed to preview member merge:",
                error
            );

            showToast(
                error?.message ||
                "Unable to preview merge.",
                "error"
            );

            button.disabled = false;
            button.textContent =
                data.merge.status === "validated"
                    ? "Refresh Preview"
                    : "Preview Merge";
        }
    });

    return button;
}

function createMarkReadyButton(data, returnView) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Mark Ready";

    const readiness = data.merge.preview_payload?.plan?.readiness || null;

    const canMarkReady =
        Boolean(data.merge.plan_hash) &&
        readiness?.analysisComplete === true &&
        readiness?.readyForApproval === true &&
        Number(readiness?.requiredDecisionCount || 0) === 0 &&
        Number(readiness?.warningCount || 0) === 0 &&
        Number(readiness?.blockerCount || 0) === 0;

    if (!canMarkReady) {
        button.disabled = true;
        button.textContent = "Mark Ready — Review Required";
        return button;
    }

    button.addEventListener("click", async () => {
        if (
            !confirm(
                "Mark this member merge ready for execution?"
            )
        ) {
            return;
        }

        button.disabled = true;
        button.textContent = "Marking Ready…";

        try {
            await markMemberMergeReady(
                data.merge.id,
                data.merge.plan_hash
            );

            showToast(
                "Merge marked ready.",
                "success"
            );

            renderMemberMergeDetailView({
                mergeId: data.merge.id,
                returnView,
            });
        } catch (error) {
            console.error(
                "Failed to mark member merge ready:",
                error
            );

            showToast(
                error?.message ||
                "Unable to mark merge ready.",
                "error"
            );

            button.disabled = false;
            button.textContent = "Mark Ready";
        }
    });

    return button;
}

function createExecuteButton(data, returnView) {
    const button = document.createElement("button");
    button.type = "button";

    const canExecute =
        data.merge.status === "ready" &&
        Boolean(data.merge.plan_hash);

    if (!canExecute) {
        button.disabled = true;

        if (data.merge.status === "completed") {
            button.textContent = "Merge Completed";
        } else if (data.merge.status === "running") {
            button.textContent = "Merge In Progress";
        } else if (data.merge.status === "failed") {
            button.textContent = "Merge Failed";
        } else if (data.merge.status === "cancelled") {
            button.textContent = "Merge Cancelled";
        } else {
            button.textContent = "Execute Merge — Not Ready";
        }

        return button;
    }

    button.textContent = "Execute Merge";

    button.addEventListener("click", async () => {
        if (!confirm("Execute this member merge?")) {
            return;
        }

        button.disabled = true;
        button.textContent = "Executing Merge…";

        let mergeCommitted = false;

        try {
            await executeMemberMerge(
                data.merge.id,
                data.merge.plan_hash
            );

            mergeCommitted = true;

            button.textContent = "Refreshing App…";

            const {
                reconcileAfterMemberMerge,
            } = await import(
                "../index.js"
            );

            await reconcileAfterMemberMerge();

            showToast(
                "Merge completed.",
                "success"
            );

            state.currentViewParams = null;

            navigateTo(returnView);
        } catch (error) {
            console.error(
                "Member merge or reconciliation failed:",
                error
            );

            if (mergeCommitted) {
                showToast(
                    "Merge completed, but the app could not refresh. Reload the app.",
                    "error"
                );

                button.disabled = true;
                button.textContent = "Merge Completed";

                return;
            }

            showToast(
                error?.message ||
                "Member merge failed.",
                "error"
            );

            button.disabled = false;
            button.textContent = "Execute Merge";
        }
    });

    return button;
}