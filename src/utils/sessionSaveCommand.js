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
            f3Name: String(
                visitor.f3Name ||
                visitor.name ||
                ""
            ).trim(),
            homeRegion: String(
                visitor.homeRegion || ""
            ).trim(),
        }))
        .filter((visitor) => visitor.f3Name.length > 0);
}

export function prepareSessionSaveCommand(
    session,
    {
        visitors = session.visitors ?? [],
    } = {}
) {
    const fngs = normalizeFngs(session.fngs ?? []);

    const attendeeIds = normalizeAttendance(
        session.attendeeIds ?? [],
        session.qIds ?? [],
        fngs
    );

    const normalizedVisitors = normalizeVisitors(visitors);

    const normalizedSession = {
        ...session,
        attendeeIds,
        fngs,
        visitors: normalizedVisitors,
    };

    return {
        session: normalizedSession,
        fngs,
        visitors: normalizedVisitors,
    };
}