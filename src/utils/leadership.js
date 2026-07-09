import { state } from "../modules/state.js";

const LEADERSHIP_LABELS = {
    aoq: "AOQ",
    ao_coq: "AO Co-Q",
    first_f: "1FQ",
    second_f: "2FQ",
    third_f: "3FQ",
    ao_data_q: "AO Data Q",

    nantan: "Nantan",
    weasel_shaker: "Weasel Shaker",
    rucking_q: "Rucking Q",
    csaup_q: "CSAUP Q",
    internal_commz_q: "Internal Commz Q",
    external_commz_q: "External Commz Q",
};

export function getLeadershipPositionLabel(position) {
    return LEADERSHIP_LABELS[position] || position;
}

export function getDashboardLeadershipBadge() {
    const role = state.currentUserRole || "pax";
    const profileId = state.currentUserProfileId;

    const labels = [];

    const accessRoleLabel =
        role === "superadmin" ? "Super Admin" :
        role === "dataq" ? "Data Q" :
        role === "slt" ? "Regional SLT" :
        role === "aoq" ? "AO SLT" :
        "PAX";

    labels.push(accessRoleLabel);

    const regionPositions = (state.profileRegionPositions || [])
        .filter(row => row.profileId === profileId)
        .map(row => getLeadershipPositionLabel(row.position));

    const aoPositions = (state.profileAoPermissions || [])
        .filter(row => row.profileId === profileId)
        .map(row => {
            const ao = state.aos.find(a => a.id === row.aoId);
            const label = getLeadershipPositionLabel(row.position);

            return ao ? `${ao.name} ${label}` : label;
        });

    return [
        ...labels,
        ...regionPositions,
        ...aoPositions,
    ].join(" • ");
}