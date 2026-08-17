import { createAppHeader } from "../components/appHeader.js";
import {
    loadMemberMerge,
    previewMemberMerge,
    markMemberMergeReady,
    executeMemberMerge,
} from "../services/cloudData.js";
import { goBack, navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";
import { state } from "../modules/state.js";

export async function renderMemberMergeDetailView(
    params = {}
) {
    const app =
        document.getElementById("app");

    app.textContent = "";

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "operationsCenter",
        showMenu: true,
    });

    app.appendChild(header);

    if (!params.mergeId) {
        showToast(
            "Missing merge id.",
            "error"
        );
        navigateTo("operationsCenter");
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

        navigateTo("operationsCenter");
        return;
    }

    if (!merge) {
        showToast(
            "Merge not found.",
            "error"
        );
    
        navigateTo("operationsCenter");
        return;
    }
    
    renderMerge(app, merge);
}

function renderMerge(
    container,
    data
) {
    const title =
        document.createElement("h1");

    title.textContent =
        "Member Merge";

    const subtitle =
        document.createElement("div");

    subtitle.classList.add("detail-label");

    subtitle.textContent =
        `${data.duplicateMember.pax_name} → ${data.canonicalMember.pax_name}`;

    container.append(
        title,
        subtitle
    );

    container.appendChild(
        createMergeStatusSection(data.merge)
    );

    container.appendChild(
        createMemberCard(
            "Canonical Member",
            data.canonicalMember
        )
    );

    container.appendChild(
        createMemberCard(
            "Duplicate Member",
            data.duplicateMember
        )
    );

    container.appendChild(
        createManifestSection(
            data.merge.preview_payload
        )
    );

    container.appendChild(createMergeActions(data));
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

function createMemberCard(
    titleText,
    member
) {
    const section =
        document.createElement("section");

    section.classList.add(
        "operations-section"
    );

    const title =
        document.createElement("h2");

    title.textContent = titleText;

    const pre =
        document.createElement("pre");

    pre.textContent = JSON.stringify(
        member,
        null,
        2
    );

    section.append(
        title,
        pre
    );

    return section;
}

function createManifestSection(previewPayload) {
    const details = document.createElement("details");

    details.open = false;

    const summary = document.createElement("summary");

    summary.textContent = "Merge Preview";

    const pre = document.createElement("pre");

    pre.textContent = JSON.stringify(
        previewPayload,
        null,
        2
    );

    details.append(
        summary,
        pre
    );

    return details;
}

function createMergeActions(data) {
    const actions = document.createElement("div");
    actions.classList.add("button-row");

    if (
        data.merge.status === "draft" ||
        data.merge.status === "validated"
    ) {
        actions.appendChild(createPreviewButton(data));
    }

    if (data.merge.status === "validated") {
        actions.appendChild(createMarkReadyButton(data));
    }

    actions.appendChild(createExecuteButton(data));

    return actions;
}

function createPreviewButton(data) {
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

function createMarkReadyButton(data) {
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

function createExecuteButton(data) {
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

            goBack(
                "operationsCenter"
            );
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