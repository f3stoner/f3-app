export function isQSlotWithinDropGuard(slot, guardHours = 48) {
    if (!slot?.date) return false;

    const slotDate = new Date(`${slot.date}T00:00:00`);
    const now = new Date();

    const diffMs = slotDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    return diffHours < guardHours;
}

export function getDropGuardMessage(aoName) {
    return `This Q is within 48 hours. Please contact your AOQ${aoName ? ` for ${aoName}` : ""} before dropping this slot.`;
}