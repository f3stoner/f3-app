import { createAppHeader } from "../components/appHeader.js";
import {
    loadMemberMerge,
    executeMemberMerge,
} from "../services/cloudData.js";
import { navigateTo } from "../utils/navigation.js";
import { showToast } from "../utils/toast.js";

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

    container.appendChild(
        createExecuteButton(data)
    );
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

function createManifestSection(
    manifest
) {
    const details =
        document.createElement("details");

    details.open = false;

    const summary =
        document.createElement("summary");

    summary.textContent =
        "Execution Manifest";

    const pre =
        document.createElement("pre");

    pre.textContent = JSON.stringify(
        manifest,
        null,
        2
    );

    details.append(
        summary,
        pre
    );

    return details;
}

function createExecuteButton(
    data
) {
    const button =
        document.createElement("button");

    button.type = "button";

    button.textContent =
        "Execute Merge";

    button.addEventListener(
        "click",
        async () => {
            if (
                !confirm(
                    "Execute this member merge?"
                )
            ) {
                return;
            }

            try {
                await executeMemberMerge(
                    data.merge.id,
                    data.merge.plan_hash
                );

                showToast(
                    "Merge completed.",
                    "success"
                );

                navigateTo(
                    "operationsCenter"
                );
            } catch (error) {
                console.error(error);

                showToast(
                    error.message,
                    "error"
                );
            }
        }
    );

    return button;
}