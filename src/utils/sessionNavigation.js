import { state } from "../modules/state.js";
import { createSession } from "../modules/sessions.js";
import { navigateTo } from "./navigation.js";

export function startSessionFromQSlot(qSlot) {
    const ao = state.aos.find(ao => ao.id === qSlot.aoId);

    state.editingSessionId = null;
    state.selectedSessionId = null;

    state.draftSession = createSession(qSlot.date, {
        aoId: qSlot.aoId,
        aoName: ao?.name || qSlot.aoName || "",
        siteId: qSlot.siteId || null,
        startTime:
            qSlot.overrideTime ||
            qSlot.startTime ||
            null,
    });

    state.draftSession.sourceQSlotId =
        qSlot.slotId ||
        qSlot.id ||
        null;

    state.draftSession.qIds = qSlot.qId ? [qSlot.qId] : [];
    state.draftSession.attendeeIds = qSlot.qId ? [qSlot.qId] : [];

    navigateTo("session");
}