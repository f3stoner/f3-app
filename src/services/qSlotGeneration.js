import { insertQSlot } from "./cloudData.js";
import { state } from "../modules/state.js";
import { formatDateForInput } from "../utils/date.js";

export function buildMissingQSlots(aos, existingQSlots, daysAhead = 28) {
    const activeAos = aos.filter(ao => ao.isActive);

    const existingKeys = new Set(
        existingQSlots.map(slot => `${slot.aoId}__${slot.date}`)
    );

    const newSlots = [];
    const today = new Date();

    for (let offset = 0; offset < daysAhead; offset++) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);

        const dayOfWeek = date.getDay();
        const formattedDate = formatDateForInput(date);

        for (const ao of activeAos) {
            const daysOfWeek = Array.isArray(ao.daysOfWeek) ? ao.daysOfWeek : [];

            if (!daysOfWeek.includes(dayOfWeek)) continue;

            const key = `${ao.id}__${formattedDate}`;
            if (existingKeys.has(key)) continue;

            newSlots.push({
                id: crypto.randomUUID(),
                aoId: ao.id,
                date: formattedDate,
                qUserId: null,
                createdAt: new Date().toISOString(),
            });

            existingKeys.add(key);
        }
    }
    return newSlots;
}

export async function generateQSlotsForCurrentRegion(daysAhead = 28) {
    const activeRegionId = state.currentRegionId;
    if (!activeRegionId) {
        throw new Error("No active region id");
    }

    const newSlots = buildMissingQSlots(state.aos, state.qSlots, daysAhead);

    for (const slot of newSlots) {
        const saved = await insertQSlot(activeRegionId, slot);
        state.qSlots.push(saved);
    }

    return {
        createdCount: newSlots.length,
        slots: newSlots,
    };
}