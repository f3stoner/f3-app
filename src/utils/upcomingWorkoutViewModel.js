import {
    findSharedWorkoutForQSlot,
    getQSlotDisplayTime,
} from "./qSlotMatching.js";
import { resolveSiteForQSlot } from "./siteResolution.js";
import { getMemberById } from "./memberLookup.js";

function findSessionForQSlot(
    slot,
    sessions,
    ao
) {
    const exactMatch =
        sessions.find(
            session =>
                session.sourceQSlotId ===
                slot.id
        );

    if (exactMatch) {
        return exactMatch;
    }

    return sessions.find(session => {
        return (
            session.date === slot.date &&
            (
                session.aoId === slot.aoId ||
                (
                    !session.aoId &&
                    session.aoName ===
                        ao?.name
                )
            )
        );
    }) || null;
}

export function createUpcomingWorkoutCardViewModel({
    slot,
    workouts = [],
    aos = [],
    sessions = [],
    commitmentSummary = null,
    memberDirectory = null,
    preblastMedia = [],
}) {
    if (!slot) {
        return null;
    }

    const ao =
        aos.find(
            candidate =>
                candidate.id === slot.aoId
        ) || null;

    const site =
        resolveSiteForQSlot(
            slot,
            ao
        );

    const workout =
        findSharedWorkoutForQSlot(
            slot,
            workouts,
            aos
        );

    const qMember =
        slot.qUserId
            ? getMemberById(
                slot.qUserId,
                memberDirectory || undefined
            )
            : null;

    const session =
        findSessionForQSlot(
            slot,
            sessions,
            ao
        );

    const preblastText =
        slot.preblastText ||
        workout?.preblastText ||
        "";

    return {
        slotId:
            slot.id,

        date:
            slot.date,

        aoId:
            slot.aoId || null,

        aoName:
            ao?.name ||
            "Unknown AO",

        siteId:
            site?.id ||
            null,

        siteName:
            site?.name ||
            "",

        displayTime:
            getQSlotDisplayTime(
                slot,
                ao,
                workout
            ),

        durationMinutes:
            slot.durationMinutes ||
            ao?.durationMinutes ||
            null,

        qId:
            slot.qUserId ||
            null,

        qName:
            qMember?.paxName ||
            qMember?.realName ||
            (
                slot.qUserId
                    ? "Q Assigned"
                    : "Open Q"
            ),

        workoutId:
            workout?.id ||
            null,

        workoutTitle:
            workout?.title ||
            "",

        hasWorkout:
            Boolean(workout),

        isWorkoutFinalized:
            Boolean(
                workout?.isFinalized
            ),

        readiness:
            !workout
                ? "needs_workout"
                : workout.isFinalized
                    ? "ready"
                    : "draft",

        preblastText,

        preblastMedia:
            Array.isArray(preblastMedia)
                ? preblastMedia
                : [],

        preblastPostedAt:
            slot.preblastPostedAt ||
            null,

        hasPreblast:
            Boolean(
                preblastText.trim() ||
                preblastMedia.length > 0
            ),

        hcCount:
            Number(
                commitmentSummary?.hcCount
            ) || 0,

        scCount:
            Number(
                commitmentSummary?.scCount
            ) || 0,

        currentCommitment:
            commitmentSummary
                ?.myCommitment ||
            null,

        sessionId:
            session?.id ||
            null,

        hasSession:
            Boolean(session),

        isCompleted:
            Boolean(session),
    };
}