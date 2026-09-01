import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL =
    process.env.PROJECT_SUPABASE_URL ||
    process.env.SUPABASE_URL;

const SERVICE_ROLE_KEY =
    process.env.PROJECT_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

const REGION_NAME =
    "F3 West Houston";

const SLOT_START_DATE =
    "2026-09-01";

const SLOT_END_DATE =
    "2026-10-04";

const PULSE_START_DATE =
    "2026-08-18";

const PULSE_END_DATE =
    "2026-08-31";

const SCHEDULE = {
    "The HOP": {
        days: [1, 3, 5],
        weekdayTime: "05:30",
        weekdayDuration: 45,
    },

    "The Branch": {
        days: [1, 3, 5],
        weekdayTime: "05:30",
        weekdayDuration: 45,
    },

    "The Point": {
        days: [2, 4, 6],
        weekdayTime: "05:30",
        saturdayTime: "06:30",
        weekdayDuration: 45,
        saturdayDuration: 60,
    },

    "The Iron Gate": {
        days: [2, 4, 6],
        weekdayTime: "05:30",
        saturdayTime: "06:30",
        weekdayDuration: 45,
        saturdayDuration: 60,
    },

    "The Oasis": {
        days: [2, 4, 6],
        weekdayTime: "05:30",
        saturdayTime: "06:30",
        weekdayDuration: 45,
        saturdayDuration: 60,
    },

    "The Corridor": {
        days: [2, 4, 6],
        weekdayTime: "05:30",
        saturdayTime: "06:30",
        weekdayDuration: 45,
        saturdayDuration: 60,
    },

    "The Knot": {
        days: [2, 4, 6],
        weekdayTime: "05:30",
        saturdayTime: "06:30",
        weekdayDuration: 45,
        saturdayDuration: 60,
    },

    "The Tower": {
        days: [2, 4, 6],
        weekdayTime: "05:30",
        saturdayTime: "06:30",
        weekdayDuration: 45,
        saturdayDuration: 60,
    },

    "The Valley": {
        days: [2, 4],
        weekdayTime: "05:30",
        weekdayDuration: 45,
    },

    "Valhalla": {
        days: [3],
        weekdayTime: "05:00",
        weekdayDuration: 60,
    },
};

function assert(
    condition,
    message
) {
    if (!condition) {
        throw new Error(message);
    }
}

function deterministicUuid(
    sourceKey
) {
    const hash =
        crypto
            .createHash("sha1")
            .update(sourceKey)
            .digest();

    hash[6] =
        (hash[6] & 0x0f) |
        0x50;

    hash[8] =
        (hash[8] & 0x3f) |
        0x80;

    const hex =
        hash
            .subarray(0, 16)
            .toString("hex");

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join("-");
}

function formatDate(
    date
) {
    const year =
        date.getUTCFullYear();

    const month =
        String(
            date.getUTCMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getUTCDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function dateRange(
    start,
    end
) {
    const dates = [];

    const current =
        new Date(
            `${start}T12:00:00Z`
        );

    const finish =
        new Date(
            `${end}T12:00:00Z`
        );

    while (
        current <= finish
    ) {
        dates.push(
            new Date(current)
        );

        current.setUTCDate(
            current.getUTCDate() +
            1
        );
    }

    return dates;
}

async function main() {
    assert(
        SUPABASE_URL,
        "Missing Supabase URL"
    );

    assert(
        SERVICE_ROLE_KEY,
        "Missing service role key"
    );

    const supabase =
        createClient(
            SUPABASE_URL,
            SERVICE_ROLE_KEY,
            {
                auth: {
                    persistSession:
                        false,

                    autoRefreshToken:
                        false,
                },
            }
        );

    const {
        data: regions,
        error: regionError,
    } = await supabase
        .from("regions")
        .select("id,name")
        .eq(
            "name",
            REGION_NAME
        );

    if (regionError) {
        throw regionError;
    }

    assert(
        regions?.length === 1,
        `Expected one ${REGION_NAME} region`
    );

    const region =
        regions[0];

    const {
        data: aos,
        error: aoError,
    } = await supabase
        .from("aos")
        .select(
            "id,name,default_site_id"
        )
        .eq(
            "region_id",
            region.id
        );

    if (aoError) {
        throw aoError;
    }

    const aoByName =
        new Map(
            aos.map(
                ao => [
                    ao.name,
                    ao,
                ]
            )
        );

    console.log("");
    console.log(
        "BUILDING WEST HOUSTON Q SLOTS"
    );
    console.log(
        "============================="
    );

    const slots = [];

    for (
        const date of
        dateRange(
            SLOT_START_DATE,
            SLOT_END_DATE
        )
    ) {
        const weekday =
            date.getUTCDay();

        const dateText =
            formatDate(date);

        for (
            const [
                aoName,
                schedule,
            ] of Object.entries(
                SCHEDULE
            )
        ) {
            if (
                !schedule.days.includes(
                    weekday
                )
            ) {
                continue;
            }

            const ao =
                aoByName.get(
                    aoName
                );

            assert(
                ao,
                `Missing AO ${aoName}`
            );

            const isSaturday =
                weekday === 6;

            const startTime =
                isSaturday &&
                schedule.saturdayTime
                    ? schedule.saturdayTime
                    : schedule.weekdayTime;

            const duration =
                isSaturday &&
                schedule.saturdayDuration
                    ? schedule.saturdayDuration
                    : schedule.weekdayDuration;

            const sourceKey =
                [
                    "west-houston-demo",
                    "q-slot",
                    ao.id,
                    dateText,
                ].join(":");

            slots.push({
                id:
                    deterministicUuid(
                        sourceKey
                    ),

                region_id:
                    region.id,

                ao_id:
                    ao.id,

                site_id:
                    ao.default_site_id ||
                    null,

                date:
                    dateText,

                start_time:
                    startTime,

                duration_minutes:
                    duration,

                q_user_id:
                    null,
            });
        }
    }

    const {
        error: slotError,
    } = await supabase
        .from("q_slots")
        .upsert(
            slots,
            {
                onConflict:
                    "id",
            }
        );

    if (slotError) {
        throw new Error(
            `Q slot seed failed: ${slotError.message}`
        );
    }

    console.log(
        `Q slots ready: ${slots.length}`
    );

    console.log("");
    console.log(
        "SEEDING RECENT PULSE"
    );
    console.log(
        "===================="
    );

    const {
        data: sessions,
        error: sessionError,
    } = await supabase
        .from("sessions")
        .select(
            "id,date,ao_name"
        )
        .eq(
            "region_id",
            region.id
        )
        .gte(
            "date",
            PULSE_START_DATE
        )
        .lte(
            "date",
            PULSE_END_DATE
        )
        .order(
            "date",
            {
                ascending: true,
            }
        );

    if (sessionError) {
        throw sessionError;
    }

    console.log(
        `Recent sessions found: ${sessions.length}`
    );

    let completed = 0;

    for (
        const session of
        sessions
    ) {
        const {
            error: feedError,
        } = await supabase.rpc(
            "reconcile_region_feed_for_session",
            {
                p_session_id:
                    session.id,
            }
        );

        if (feedError) {
            throw new Error(
                `Feed failed for ${session.date} ${session.ao_name}: ${feedError.message}`
            );
        }

        const {
            error:
                achievementError,
        } = await supabase.rpc(
            "reconcile_region_feed_achievements_for_session",
            {
                p_session_id:
                    session.id,
            }
        );

        if (
            achievementError
        ) {
            throw new Error(
                `Achievement feed failed for ${session.date} ${session.ao_name}: ${achievementError.message}`
            );
        }

        completed++;

        console.log(
            `  ${completed}/${sessions.length} ${session.date} - ${session.ao_name}`
        );
    }

    console.log("");
    console.log(
        "WEST HOUSTON DEMO EXTRAS READY"
    );
    console.log(
        "=============================="
    );

    console.log(
        `Future Q slots: ${slots.length}`
    );

    console.log(
        `Pulse sessions seeded: ${sessions.length}`
    );
}

main().catch(
    error => {
        console.error("");
        console.error(
            "West Houston extras seed failed."
        );

        console.error(
            error?.message ||
            error
        );

        process.exit(1);
    }
);