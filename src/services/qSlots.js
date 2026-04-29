import { updateQSlotInCloud } from "./cloudData.js";
import { state } from "../modules/state.js";
import { formatDate } from "../utils/date.js";
import { getDropGuardMessage, isQSlotWithinDropGuard } from "../utils/qSlotGuards.js";

export async function unclaimQSlot(slot, { bypassDropGuard = false } = []) {
    const ao = state.aos.find(a => a.id === slot.aoId);

    if (
        !bypassDropGuard &&
        slot.qUserId === state.currentUserMemberId &&
        isQSlotWithinDropGuard(slot)
    ) {
        alert(getDropGuardMessage(ao?.name));
        return { success: false, reason: "drop_guard" };
    }

    const confirmed = confirm(`Unclaim this Q slot for ${ao?.name || "this AO"} on ${formatDate(slot.date)}?`);
    if (!confirmed) {
        return { success: false, reason: "cancelled" };
    }

    const updatedSlot = await updateQSlotInCloud(state.currentRegionId, {
        ...slot,
        qUserId: null,
    });

    const index = state.qSlots.findIndex(q => q.id === slot.id);
    if (index !== -1) {
        state.qSlots[index] = updatedSlot;
    }

    return { success: true, slot: updatedSlot };
}