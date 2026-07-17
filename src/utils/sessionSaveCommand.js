// src/utils/sessionSaveCommand.js

/**
 * Converts editable UI session state into a deterministic save command.
 *
 * Responsibilities:
 *  - Assign stable UUIDs to new FNGs.
 *  - Normalize Proud Papa relationships.
 *  - Ensure attendance contains every Q and FNG.
 *  - Normalize visitor input.
 *
 * This function is intentionally pure:
 *  - Performs no I/O.
 *  - Does not talk to Supabase.
 *  - Does not mutate the original session.
 */

function normalizeFngs(fngs = []) {
    return fngs.map((fng) => {
        const isNew = !fng.memberId;
        const memberId = fng.memberId ?? crypto.randomUUID();

        const inviterIds = Array.from(
            new Set(
                [
                    ...(Array.isArray(fng.inviterIds) ? fng.inviterIds : []),
                    fng.invitedById
                ].filter(Boolean)
            )
        ).sort();

        const invitedById = inviterIds[0] ?? null;

        return {
            ...fng,
            memberId,
            invitedById,
            inviterIds,
            isNew
        };
    });
}

function normalizeAttendance(attendeeIds = [], qIds = [], fngs = []) {
    return Array.from(
        new Set([
            ...attendeeIds.filter(Boolean),
            ...qIds.filter(Boolean),
            ...fngs
                .map(f => f.memberId)
                .filter(Boolean)
        ])
    );
}

function normalizeVisitors(visitors = []) {
    return visitors
        .map((visitor) => ({
            ...visitor,
            name: visitor.name?.trim() ?? ""
        }))
        .filter((visitor) => visitor.name.length > 0);
}

export function prepareSessionSaveCommand(session, { visitors = [] } = {}) {
    const fngs = normalizeFngs(session.fngs ?? []);

    const attendeeIds = normalizeAttendance(
        session.attendeeIds ?? [],
        session.qIds ?? [],
        fngs
    );

    return {
        session: {
            ...session,
            attendeeIds
        },
        fngs,
        visitors: normalizeVisitors(visitors)
    };
}