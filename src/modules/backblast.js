import { formatDate } from "../utils/date.js";
import { getWorkoutFieldLabel } from "../utils/workoutLabels.js";
import { state } from "./state.js";
import { getSessionAnnouncementText } from "../utils/announcements.js";
import {
    getMemberById,
} from "../utils/memberLookup.js";

function buildConditionsLine(weather) {
    if (!weather) return null;

    const rainLabel =
        typeof weather.precipChance === "number"
            ? `${weather.precipChance}% rain`
            : "rain chance unavailable";

    const windLabel =
        typeof weather.windMph === "number"
            ? `${weather.windMph} mph wind`
            : "wind unavailable";

    return `Conditions: ${weather.temp}° and ${weather.condition}, ${rainLabel}, ${windLabel}.`;
}

function safeString(value, fallback = "Unknown") {
    const text = String(value || "").trim();
    return text || fallback;
}

function safeLocaleCompare(a, b) {
    return safeString(a, "").localeCompare(safeString(b, ""));
}

function getMemberBackblastName(member) {
    if (!member) return "Unknown";

    return safeString(member.paxName || member.realName, "Unknown");
}

function buildBackblastData(session, members) {
    const attendeeIds = session.attendeeIds || [];
    const fngs = session.fngs || [];
    const effectiveQIds =
        session.qIds ||
        (session.qId ? [session.qId] : []);
    const visitors = session.visitors || [];

    const ao =
        state.aos.find(
            candidate =>
                candidate.id === session.aoId
        ) ||
        state.aos.find(
            candidate =>
                candidate.name === session.aoName
        ) ||
        null;

    const site =
        state.sites?.find(
            candidate =>
                candidate.id === session.siteId
        ) ||
        null;

    const siteName =
        site?.name ||
        ao?.locationName ||
        "";

    const siteAddress =
        site?.address ||
        ao?.address ||
        "";

    const fngMemberIdSet = new Set(
        fngs
            .map(fng => fng.memberId)
            .filter(Boolean)
    );

    const formattedDate =
        formatDate(session.date);

    const qNames = effectiveQIds
        .map(qId => {
            const matchedMember =
                getMemberById(
                    qId,
                    members
                );

            if (!matchedMember) {
                console.warn(
                    "Backblast Q not found in members:",
                    {
                        qId,
                        attendeeIds,
                        memberCount:
                            members.length,
                    }
                );

                return null;
            }

            return `@${getMemberBackblastName(
                matchedMember
            )}`;
        })
        .filter(Boolean)
        .sort((a, b) =>
            a.localeCompare(b)
        );

    const qLabel =
        qNames.length > 0
            ? qNames.join("\n")
            : "-";

    const qSectionLabel =
        qNames.length === 1
            ? "Q"
            : `Qs (${qNames.length})`;

    const qIdSet =
        new Set(effectiveQIds);

    const paxNamesArray =
        attendeeIds
            .filter(
                id =>
                    !qIdSet.has(id)
            )
            .filter(
                id =>
                    !fngMemberIdSet.has(id)
            )
            .map(id => {
                const member =
                    getMemberById(
                        id,
                        members
                    );

                return getMemberBackblastName(
                    member
                );
            })
            .sort(safeLocaleCompare);

    const paxNames =
        paxNamesArray.length > 0
            ? paxNamesArray
                .map(name => `@${name}`)
                .join("\n")
            : "None";

    const fngText =
        fngs.length === 0
            ? "None"
            : fngs
                .map(fng => {
                    const displayName =
                        fng.paxName &&
                        fng.realName
                            ? `${fng.paxName} (${fng.realName})`
                            : (
                                fng.paxName ||
                                fng.realName ||
                                "Unknown"
                            );

                    const inviterIds = [
                        ...(
                            Array.isArray(
                                fng.inviterIds
                            )
                                ? fng.inviterIds
                                : []
                        ),
                        fng.invitedById,
                        fng.invited_by_id,
                    ].filter(Boolean);

                    const uniqueInviterIds = [
                        ...new Set(
                            inviterIds
                        ),
                    ];

                    if (
                        uniqueInviterIds.length === 0
                    ) {
                        return displayName;
                    }

                    const inviterNames =
                        uniqueInviterIds
                            .map(
                                inviterId => {
                                    const inviter =
                                        getMemberById(
                                            inviterId,
                                            members
                                        );

                                    if (!inviter) {
                                        console.warn(
                                            "Backblast inviter not found in members:",
                                            {
                                                inviterId,
                                                fngMemberId:
                                                    fng.memberId ||
                                                    null,
                                                fngName:
                                                    displayName,
                                            }
                                        );

                                        return null;
                                    }

                                    return `@${getMemberBackblastName(
                                        inviter
                                    )}`;
                                }
                            )
                            .filter(Boolean);

                    if (
                        inviterNames.length === 0
                    ) {
                        return displayName;
                    }

                    return `${displayName} (Invited by ${inviterNames.join(", ")})`;
                })
                .sort(safeLocaleCompare)
                .join("\n");

    const visitorText =
        visitors.length === 0
            ? "None"
            : visitors
                .map(visitor => {
                    const name =
                        safeString(
                            visitor.f3Name,
                            "Unknown"
                        );

                    return visitor.homeRegion
                        ? `${name} (${visitor.homeRegion})`
                        : name;
                })
                .sort(safeLocaleCompare)
                .join("\n");

    const totalAttendees =
        new Set([
            ...attendeeIds.filter(
                id =>
                    !fngMemberIdSet.has(id)
            ),
            ...effectiveQIds,
        ]).size +
        fngs.length +
        visitors.length;

    const backblastIntro =
        `${totalAttendees} HIM met at ${
            session.aoName || "the AO"
        } today to get 1% better.`;

    const aoHashtag =
        session.aoName
            ? `#${session.aoName.replace(
                /\s+/g,
                ""
            )}`
            : "";

    return {
        attendeeIds,
        fngs,
        visitors,
        effectiveQIds,
        formattedDate,
        siteName,
        siteAddress,
        qNames,
        qLabel,
        qSectionLabel,
        paxNamesArray,
        paxNames,
        fngText,
        visitorText,
        totalAttendees,
        backblastIntro,
        aoHashtag,
    };
}

export function generateBackblastHashtags(
    session,
    members
) {
    if (!session) return "";

    const {
        aoHashtag,
    } = buildBackblastData(
        session,
        members
    );

    return [
        "#backblast",
        aoHashtag,
    ]
        .filter(Boolean)
        .join(" ");
}

export function generateBackblastHeader(
    session,
    members
) {
    if (!session) return "";

    const {
        formattedDate,
        siteName,
        qLabel,
        qSectionLabel,
        paxNamesArray,
        paxNames,
        fngText,
        visitorText,
        visitors,
        fngs,
        totalAttendees,
    } = buildBackblastData(
        session,
        members
    );

    return [
        [
            session.aoName,
            formattedDate,
        ]
            .filter(Boolean)
            .join(" · "),
    
        siteName || null,
    
        buildConditionsLine(
            session.weatherSnapshot
        ),
    
        "",
    
        `Total Attendees: ${totalAttendees}`,
    
        "",
    
        `${qSectionLabel}: ${qLabel}`,
    
        "",
    
        `PAX (${paxNamesArray.length}):`,
        paxNames,
    
        "",
    
        `Visiting PAX (${visitors.length}):`,
        visitorText,
    
        "",
    
        `FNGs (${fngs.length}):`,
        fngText,
    ]
        .filter(item => item !== null)
        .join("\n");
}

export function generateBackblastBody(
    session
) {
    if (!session) return "";

    const workout =
        session.workout;

    let workoutText =
        session.notes
            ? session.notes
            : "-";

    if (workout) {
        const parts = [];

        if (workout.title) {
            parts.push(
                `Title: ${workout.title}`
            );
        }

        if (workout.introduction) {
            parts.push(
                `${getWorkoutFieldLabel(
                    state,
                    "introduction"
                )}:\n${workout.introduction}`
            );
        }

        if (workout.warmorama) {
            parts.push(
                `${getWorkoutFieldLabel(
                    state,
                    "warmorama"
                )}:\n${workout.warmorama}`
            );
        }

        if (workout.thangs) {
            parts.push(
                `${getWorkoutFieldLabel(
                    state,
                    "thangs"
                )}:\n${workout.thangs}`
            );
        }

        if (workout.finisher) {
            parts.push(
                `${getWorkoutFieldLabel(
                    state,
                    "finisher"
                )}:\n${workout.finisher}`
            );
        }

        if (workout.notes) {
            parts.push(
                `${getWorkoutFieldLabel(
                    state,
                    "notes"
                )}:\n${workout.notes}`
            );
        }

        const thirdFText =
            String(
                workout.thirdFText || ""
            )
                .replace(
                    /^THIRD F\s*:?\s*/i,
                    ""
                )
                .trim();

        if (thirdFText) {
            parts.push(
                `THIRD F\n\n${thirdFText}`
            );
        }

        const announcementText =
            getSessionAnnouncementText(
                session
            )
                .replace(
                    /^ANNOUNCEMENTS\s*:?\s*/i,
                    ""
                )
                .trim();

        if (announcementText) {
            parts.push(
                `ANNOUNCEMENTS\n\n${announcementText}`
            );
        }

        if (session.notes) {
            parts.push(
                `Session Notes:\n${session.notes}`
            );
        }

        workoutText =
            parts.length > 0
                ? parts.join("\n\n")
                : "-";
    } else if (session.notes) {
        workoutText =
            `Notes:\n${session.notes}`;
    }

    return workoutText;
}

export function composeBackblast({
    hashtagsText = "",
    introText = "",
    headerText = "",
    bodyText = "",
}) {
    return [
        hashtagsText.trim() || null,
        introText.trim() || null,
        headerText.trim() || null,
        bodyText.trim() || null,
    ]
        .filter(Boolean)
        .join("\n\n");
}

export function generateBackblastIntro(
    session,
    members
) {
    if (!session) return "";

    return buildBackblastData(
        session,
        members
    ).backblastIntro;
}

export function buildBackblastSnapshot(
    session,
    members
) {
    return composeBackblast({

        hashtagsText:
            session.backblastHashtagsText ??
            generateBackblastHashtags(
                session,
                members
            ),
    
        introText:
            session.backblastIntroText ??
            generateBackblastIntro(
                session,
                members
            ),
    
        headerText:
            generateBackblastHeader(
                session,
                members
            ),
    
        bodyText:
            session.backblastBodyText ??
            generateBackblastBody(
                session
            ),
    });
}

export function generateBackblast(
    session,
    members
) {
    return buildBackblastSnapshot(
        session,
        members
    );
}