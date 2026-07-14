function normalizeDateKey(value) {
    if (typeof value === "string") {
        const dateKey = value.slice(0, 10);

        return /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
            ? dateKey
            : null;
    }

    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return null;
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function getLocalDateKey(value = new Date()) {
    return normalizeDateKey(value) ?? normalizeDateKey(new Date());
}

function isAnnouncementInDateRange(announcement, targetDate) {
    const startsOn = normalizeDateKey(announcement?.startsOn);
    const endsOn = normalizeDateKey(announcement?.endsOn);

    if (startsOn && startsOn > targetDate) {
        return false;
    }

    if (endsOn && endsOn < targetDate) {
        return false;
    }

    return true;
}

function isAnnouncementInScope(
    announcement,
    {
        regionId,
        aoId,
        includeRegionScope,
    }
) {
    if (regionId && announcement?.regionId !== regionId) {
        return false;
    }

    const announcementAoId = announcement?.aoId || null;
    const announcementScope = announcement?.scope || null;

    // An announcement tied to an AO is treated as AO-scoped,
    // regardless of whether legacy data populated the scope field.
    if (announcementAoId) {
        return Boolean(aoId) && announcementAoId === aoId;
    }

    if (
        announcementScope === null ||
        announcementScope === "" ||
        announcementScope === "region"
    ) {
        return includeRegionScope;
    }

    // Support explicitly AO-scoped rows only when an AO matches.
    // Rows with scope "ao" but no aoId are invalid and excluded.
    if (announcementScope === "ao") {
        return false;
    }

    // Unsupported scope values should not leak into active surfaces.
    return false;
}

function getDisplayOrder(announcement) {
    const value = announcement?.displayOrder;

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return Number.POSITIVE_INFINITY;
    }

    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? numericValue
        : Number.POSITIVE_INFINITY;
}

function compareAnnouncements(left, right) {
    const leftOrder = getDisplayOrder(left);
    const rightOrder = getDisplayOrder(right);

    if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
    }

    const leftCreatedAt = left?.createdAt || "";
    const rightCreatedAt = right?.createdAt || "";

    if (leftCreatedAt !== rightCreatedAt) {
        return rightCreatedAt.localeCompare(leftCreatedAt);
    }

    return String(left?.id || "").localeCompare(
        String(right?.id || "")
    );
}

export function resolveActiveAnnouncements(
    announcements = [],
    {
        regionId = null,
        targetDate = new Date(),
        aoId = null,
        includeRegionScope = true,
    } = {}
) {
    const resolvedTargetDate = getLocalDateKey(targetDate);

    return announcements
        .filter(announcement => announcement?.isActive === true)
        .filter(announcement =>
            isAnnouncementInDateRange(
                announcement,
                resolvedTargetDate
            )
        )
        .filter(announcement =>
            isAnnouncementInScope(announcement, {
                regionId,
                aoId,
                includeRegionScope,
            })
        )
        .slice()
        .sort(compareAnnouncements);
}

export function formatAnnouncementsText(announcements = []) {
    return announcements
        .map(announcement =>
            [
                announcement?.title?.trim(),
                announcement?.body?.trim(),
            ]
                .filter(Boolean)
                .join("\n")
        )
        .filter(Boolean)
        .join("\n\n");
}

export function getEffectiveWorkoutAnnouncementText({
    workout,
    announcements = [],
    regionId = null,
    targetDate = null,
    aoId = null,
    includeRegionScope = true,
} = {}) {
    const resolvedMode =
        workout?.announcementMode === "custom"
            ? "custom"
            : "auto";

    const resolvedTargetDate =
        targetDate ||
        workout?.date ||
        getLocalDateKey();

    const resolvedAoId =
        aoId ??
        workout?.aoId ??
        null;

    if (resolvedMode === "custom") {
        return {
            text: workout?.announcementText || "",
            mode: "custom",
            source: "custom",
            resolvedAnnouncements: [],
            targetDate: getLocalDateKey(resolvedTargetDate),
            aoId: resolvedAoId,
        };
    }

    const resolvedAnnouncements = resolveActiveAnnouncements(
        announcements,
        {
            regionId,
            targetDate: resolvedTargetDate,
            aoId: resolvedAoId,
            includeRegionScope,
        }
    );

    return {
        text: formatAnnouncementsText(resolvedAnnouncements),
        mode: "auto",
        source: "live_announcements",
        resolvedAnnouncements,
        targetDate: getLocalDateKey(resolvedTargetDate),
        aoId: resolvedAoId,
    };
}

function buildAnnouncementSnapshotItem(announcement) {
    return {
        id: announcement?.id || null,
        title: announcement?.title || "",
        body: announcement?.body || "",
        scope: announcement?.scope || null,
        aoId: announcement?.aoId || null,
        startsOn: announcement?.startsOn || null,
        endsOn: announcement?.endsOn || null,
        displayOrder: announcement?.displayOrder ?? null,
    };
}

export function buildSessionAnnouncementSnapshot({
    workout,
    announcements = [],
    regionId = null,
    resolvedAt = new Date(),
} = {}) {
    const effective = getEffectiveWorkoutAnnouncementText({
        workout,
        announcements,
        regionId,
    });

    const resolvedAtIso =
        resolvedAt instanceof Date &&
        !Number.isNaN(resolvedAt.getTime())
            ? resolvedAt.toISOString()
            : new Date().toISOString();

    const snapshot = {
        text: effective.text,
        mode: effective.mode,
        source: workout?.id
            ? "planned_workout"
            : "session_log",
        resolvedAt: resolvedAtIso,
        targetDate: effective.targetDate,
        regionId: regionId || workout?.regionId || null,
        aoId: effective.aoId,
        announcementIds: effective.resolvedAnnouncements
            .map(announcement => announcement?.id)
            .filter(Boolean),
        announcements: effective.resolvedAnnouncements
            .map(buildAnnouncementSnapshotItem),
    };

    return {
        text: effective.text,
        snapshot,
    };
}

export function getSessionAnnouncementText(session) {
    if (typeof session?.announcementText === "string") {
        return session.announcementText;
    }

    if (
        typeof session?.announcementSnapshot?.text === "string"
    ) {
        return session.announcementSnapshot.text;
    }

    if (
        typeof session?.workout?.announcementText === "string"
    ) {
        return session.workout.announcementText;
    }

    return "";
}

export function invalidatePlannerAnnouncementCache() {
    state.plannerAnnouncements = [];
    state.plannerAnnouncementsRegionId = null;
    state.hasLoadedPlannerAnnouncements = false;
    state.isLoadingPlannerAnnouncements = false;
}