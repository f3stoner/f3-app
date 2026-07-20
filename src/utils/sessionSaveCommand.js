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

export function buildSessionSaveRpcCommand({
    mode = "create",
    regionId,
    session,
    fngs = [],
    visitors = [],
}) {
    if (!regionId) {
        throw new Error("Region id is required");
    }

    if (!session?.id) {
        throw new Error("Session id is required");
    }

    if (mode !== "create" && mode !== "update") {
        throw new Error(
            `Invalid session save mode: ${mode}`
        );
    }

    const commandFngs = (fngs || []).map(fng => ({
        memberId: fng.memberId || null,
        realName: fng.realName || "",
        paxName: fng.paxName || null,
        inviterIds: Array.isArray(fng.inviterIds)
            ? [
                ...new Set(
                    fng.inviterIds.filter(Boolean)
                ),
            ]
            : [],
        invitedById:
            fng.invitedById ||
            fng.inviterIds?.[0] ||
            null,
        isNew: Boolean(fng.isNew),
    }));

    const commandVisitors = (visitors || [])
        .filter(visitor =>
            String(visitor.f3Name || "").trim()
        )
        .map(visitor => ({
            id: visitor.id || null,
            f3Name: String(
                visitor.f3Name || ""
            ).trim(),
            homeRegion: String(
                visitor.homeRegion || ""
            ).trim(),
            realName: String(
                visitor.realName || ""
            ).trim(),
        }));

    const sessionPayload = {
        id: session.id,
        date: session.date,
        aoId: session.aoId || null,
        siteId: session.siteId || null,
        aoName: session.aoName || "",
        qIds: session.qIds || [],
        attendeeIds: session.attendeeIds || [],
        notes: session.notes || "",
        workout: session.workout || null,

        announcementText:
            typeof session.announcementText === "string"
                ? session.announcementText
                : null,

        announcementSnapshot:
            session.announcementSnapshot || null,

        sourcePlannedWorkoutId:
            session.sourcePlannedWorkoutId || null,

        sourceQSlotId:
            session.sourceQSlotId || null,

        createdAt:
            session.createdAt || Date.now(),

        backblastText:
            session.backblastText || "",

        backblastStatus:
            session.backblastStatus || null,

        backblastPostedAt:
            session.backblastPostedAt || null,

        unresolvedPax:
            session.unresolvedPax || [],

        weatherSnapshot:
            session.weatherSnapshot || null,

        startTime:
            session.startTime || null,

        attendanceReviewStatus:
            session.attendanceReviewStatus ||
            "not_required",

        attendanceReviewNotes:
            session.attendanceReviewNotes || null,
    };

    return {
        p_mode: mode,
        p_region_id: regionId,
        p_session: sessionPayload,
        p_fngs: commandFngs,
        p_visitors: commandVisitors,
    };
}