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