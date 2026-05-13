import { state } from "../modules/state.js";

export function userAlreadyHasQOnDate(date, memberId, excludeSlotId = null) {
    if (!date || !memberId) return false;

    return state.qSlots.some(slot =>
        slot.id !== excludeSlotId &&
        slot.date === date &&
        slot.qUserId === memberId
    );
}