import { state } from "../modules/state.js";

export function isQSlotWithinDropGuard(slot, guardHours = 48) {
    if (!slot?.date) return false;

    const slotDate = new Date(`${slot.date}T00:00:00`);
    const now = new Date();

    const diffMs = slotDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours < guardHours;
}

export function getDropGuardMessage(slot) {
    return `This Q is within 48 hours. Please contact ${getAoLeadershipContactLabel(slot?.aoId)} to drop this slot.`;
}

function getAoLeadershipContactLabel(aoId) {
    const contacts = (state.aoLeadershipContacts || [])
        .filter(contact =>
            contact.aoId === aoId &&
            ["aoq", "ao_coq"].includes(contact.position)
        );

    const primary =
        contacts.find(contact => contact.position === "aoq") ||
        contacts.find(contact => contact.position === "ao_coq");

    if (!primary) return "your AO SLT";

    const positionLabel =
        primary.position === "aoq" ? "AOQ" :
        primary.position === "ao_coq" ? "AO Co-Q" :
        "AO SLT";

    return `${primary.displayName || "your AO SLT"} · ${primary.aoName || "this AO"} ${positionLabel}`;
}