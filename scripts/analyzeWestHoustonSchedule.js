import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const PARSED_PATH =
    path.join(
        __dirname,
        "../import/west-houston/output/band_backblasts_parsed.json"
    );

const RAW_PATH =
    path.join(
        __dirname,
        "../import/west-houston/band_raw_posts.json"
    );

const CANONICAL_AOS = [
    "The HOP",
    "The Point",
    "The Iron Gate",
    "The Oasis",
    "The Branch",
    "The Corridor",
    "The Valley",
    "The Knot",
    "The Tower",
    "Valhalla",
];

const AO_ALIASES = new Map([
    ["the hop", "The HOP"],
    ["hop", "The HOP"],
    ["hall of pain", "The HOP"],
    ["the hall of pain", "The HOP"],

    ["the point", "The Point"],
    ["point", "The Point"],

    ["the iron gate", "The Iron Gate"],
    ["iron gate", "The Iron Gate"],
    ["irongate", "The Iron Gate"],

    ["the oasis", "The Oasis"],
    ["oasis", "The Oasis"],

    ["the branch", "The Branch"],
    ["branch", "The Branch"],

    ["the corridor", "The Corridor"],
    ["corridor", "The Corridor"],

    ["the valley", "The Valley"],
    ["valley", "The Valley"],

    ["the knot", "The Knot"],
    ["knot", "The Knot"],

    ["the tower", "The Tower"],
    ["tower", "The Tower"],

    ["valhalla", "Valhalla"],
]);

const WEBSITE_SCHEDULE = {
    "The HOP": {
        days: [
            "Monday",
            "Wednesday",
            "Friday",
        ],
        startTime:
            "05:30",
    },

    "The Branch": {
        days: [
            "Monday",
            "Wednesday",
            "Friday",
        ],
        startTime:
            "05:30",
    },

    "The Corridor": {
        days: [
            "Tuesday",
            "Thursday",
            "Saturday",
        ],
        startTime:
            "05:30",
        saturdayStartTime:
            "06:30",
    },

    "The Point": {
        days: [
            "Tuesday",
            "Thursday",
            "Saturday",
        ],
        startTime:
            "05:30",
        saturdayStartTime:
            "06:30",
    },

    "The Tower": {
        days: [
            "Tuesday",
            "Thursday",
            "Saturday",
        ],
        startTime:
            "05:30",
        saturdayStartTime:
            "06:30",
    },

    "The Oasis": {
        days: [
            "Tuesday",
            "Thursday",
            "Saturday",
        ],
        startTime:
            "05:30",
        saturdayStartTime:
            "06:30",
    },

    "The Valley": {
        days: [
            "Tuesday",
            "Thursday",
        ],
        startTime:
            "05:30",
    },

    "Valhalla": {
        days: [
            "Wednesday",
        ],
        startTime:
            "05:00",
    },
};

const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const Q_SHEET_TERMS = [
    "q sheet",
    "q-sheet",
    "qsheet",
    "q signup",
    "q sign up",
    "q sign-up",
    "sign up to q",
    "signup to q",
    "need a q",
    "need q",
    "looking for a q",
    "looking for q",
    "open q",
    "open slot",
    "open q slot",
    "who wants to q",
    "who can q",
    "volunteer to q",
    "volunteer q",
    "q calendar",
    "q schedule",
    "q roster",
    "upcoming q",
];

function assert(
    condition,
    message
) {
    if (!condition) {
        throw new Error(
            message
        );
    }
}

function loadJson(
    filePath
) {
    assert(
        fs.existsSync(
            filePath
        ),
        `Missing file: ${filePath}`
    );

    return JSON.parse(
        fs.readFileSync(
            filePath,
            "utf8"
        )
    );
}

function normalize(
    value = ""
) {
    return String(value)
        .toLowerCase()
        .replace(
            /[’']/g,
            "'"
        )
        .replace(
            /[^a-z0-9']+/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

function canonicalizeAo(
    value = ""
) {
    return (
        AO_ALIASES.get(
            normalize(value)
        ) || null
    );
}

function getParsedPosts(
    input
) {
    if (
        Array.isArray(
            input
        )
    ) {
        return input;
    }

    if (
        Array.isArray(
            input.posts
        )
    ) {
        return input.posts;
    }

    throw new Error(
        "Could not find parsed posts array."
    );
}

function getRawPosts(
    input
) {
    if (
        Array.isArray(
            input
        )
    ) {
        return input;
    }

    if (
        Array.isArray(
            input.posts
        )
    ) {
        return input.posts;
    }

    if (
        Array.isArray(
            input.result_data?.items
        )
    ) {
        return input
            .result_data
            .items;
    }

    throw new Error(
        "Could not find raw posts array."
    );
}

function parseDate(
    value
) {
    if (!value) {
        return null;
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date;
}

function inferWeekday(
    post
) {
    /*
     * Prefer the workout date inferred
     * by the parser, not BAND post date.
     */
    const date =
        parseDate(
            post.date
        );

    if (!date) {
        return null;
    }

    /*
     * YYYY-MM-DD is interpreted as UTC
     * by JS, which is fine for weekday
     * classification as long as we use
     * UTC here too.
     */
    return WEEKDAYS[
        date.getUTCDay()
    ];
}

function buildAoWeekdayCounts(
    posts
) {
    const counts = {};

    for (
        const ao of
        CANONICAL_AOS
    ) {
        counts[ao] = {};

        for (
            const day of
            WEEKDAYS
        ) {
            counts[ao][day] =
                0;
        }
    }

    for (
        const post of
        posts
    ) {
        const ao =
            canonicalizeAo(
                post.aoName
            );

        if (!ao) {
            continue;
        }

        const weekday =
            inferWeekday(
                post
            );

        if (!weekday) {
            continue;
        }

        counts[ao][weekday] +=
            1;
    }

    return counts;
}

function printAoEvidence(
    counts
) {
    console.log("");
    console.log(
        "BAND BACKBLAST WEEKDAY EVIDENCE"
    );
    console.log(
        "==============================="
    );

    for (
        const ao of
        CANONICAL_AOS
    ) {
        console.log("");
        console.log(
            ao
        );

        for (
            const day of
            WEEKDAYS
        ) {
            console.log(
                `  ${day.padEnd(9)} ${counts[ao][day]}`
            );
        }
    }
}

function printWebsiteComparison(
    counts
) {
    console.log("");
    console.log(
        "WEBSITE VS BAND"
    );
    console.log(
        "==============="
    );

    for (
        const ao of
        CANONICAL_AOS
    ) {
        console.log("");
        console.log(
            ao
        );

        const website =
            WEBSITE_SCHEDULE[
                ao
            ];

        if (website) {
            console.log(
                `  Website: ${website.days.join(", ")}`
            );
        } else {
            console.log(
                "  Website: not listed"
            );
        }

        const activeDays =
            WEEKDAYS
                .map(
                    day => ({
                        day,
                        count:
                            counts[
                                ao
                            ][day],
                    })
                )
                .filter(
                    item =>
                        item.count >
                        0
                )
                .sort(
                    (a, b) =>
                        b.count -
                        a.count
                );

        console.log(
            `  BAND:    ${
                activeDays.length
                    ? activeDays
                        .map(
                            item =>
                                `${item.day} (${item.count})`
                        )
                        .join(", ")
                    : "no evidence"
            }`
        );
    }
}

function objectText(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    if (
        typeof value ===
        "string"
    ) {
        return value;
    }

    if (
        typeof value ===
        "number"
    ) {
        return String(value);
    }

    if (
        Array.isArray(
            value
        )
    ) {
        return value
            .map(
                objectText
            )
            .join("\n");
    }

    if (
        typeof value ===
        "object"
    ) {
        return Object.values(
            value
        )
            .map(
                objectText
            )
            .join("\n");
    }

    return "";
}

function extractUrls(
    value
) {
    const text =
        objectText(
            value
        );

    const matches =
        text.match(
            /https?:\/\/[^\s<>"')\]]+/gi
        ) || [];

    return [
        ...new Set(
            matches
        ),
    ];
}

function getRawPostText(
    post
) {
    const candidates = [
        post.content,
        post.text,
        post.body,
        post.message,
        post.post,
        post.description,
    ];

    const direct =
        candidates
            .filter(
                value =>
                    typeof value ===
                    "string"
            )
            .join("\n");

    if (direct.trim()) {
        return direct;
    }

    /*
     * Raw BAND exports have changed shape
     * across our scripts. Fall back to all
     * string values so this still works.
     */
    return objectText(
        post
    );
}

function getRawPostDate(
    post
) {
    return (
        post.createdAtIso ||
        post.created_at ||
        post.createdAt ||
        post.created_time ||
        post.created ||
        post.date ||
        ""
    );
}

function getRawPostAuthor(
    post
) {
    return (
        post.authorName ||
        post.author_name ||
        post.writer?.name ||
        post.author?.name ||
        post.user?.name ||
        ""
    );
}

function getRawPostKey(
    post
) {
    return (
        post.postKey ||
        post.post_key ||
        post.key ||
        post.id ||
        ""
    );
}

function findSchedulingPosts(
    rawPosts
) {
    const matches = [];

    for (
        const post of
        rawPosts
    ) {
        const text =
            getRawPostText(
                post
            );

        const normalizedText =
            text.toLowerCase();

        const urls =
            extractUrls(
                post
            );

        const matchedTerms =
            Q_SHEET_TERMS.filter(
                term =>
                    normalizedText.includes(
                        term
                    )
            );

        const scheduleUrl =
            urls.some(
                url =>
                    /docs\.google\.com|sheets\.google\.com|forms\.gle|docs\.googleusercontent\.com/i.test(
                        url
                    )
            );

        /*
         * Also catch posts mentioning Q +
         * future/sign-up-ish language even
         * if they don't use one of our exact
         * phrases.
         */
        const looseQCandidate =
            /\bq\b/i.test(
                text
            ) &&
            /(sign|signup|sheet|schedule|slot|open|need|calendar|volunteer|week|month)/i.test(
                text
            );

        if (
            !matchedTerms.length &&
            !scheduleUrl &&
            !looseQCandidate
        ) {
            continue;
        }

        matches.push({
            date:
                getRawPostDate(
                    post
                ),

            author:
                getRawPostAuthor(
                    post
                ),

            postKey:
                getRawPostKey(
                    post
                ),

            matchedTerms,

            urls,

            text:
                text
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim(),
        });
    }

    return matches;
}

function scoreSchedulingPost(
    post
) {
    let score = 0;

    score +=
        post.matchedTerms.length *
        5;

    if (
        post.urls.some(
            url =>
                /docs\.google\.com|sheets\.google\.com/i.test(
                    url
                )
        )
    ) {
        score += 20;
    }

    if (
        post.urls.some(
            url =>
                /forms\.gle/i.test(
                    url
                )
        )
    ) {
        score += 10;
    }

    if (
        /q sheet|qsheet|q schedule|q calendar/i.test(
            post.text
        )
    ) {
        score += 15;
    }

    if (
        /sign.?up|open slot|need a q|looking for.*q/i.test(
            post.text
        )
    ) {
        score += 8;
    }

    return score;
}

function printSchedulingPosts(
    matches
) {
    console.log("");
    console.log(
        "LIKELY Q-SHEET / SCHEDULING POSTS"
    );
    console.log(
        "================================="
    );

    const ranked =
        matches
            .map(
                post => ({
                    ...post,
                    score:
                        scoreSchedulingPost(
                            post
                        ),
                })
            )
            .sort(
                (a, b) =>
                    b.score -
                    a.score
            );

    if (
        ranked.length ===
        0
    ) {
        console.log(
            "No likely Q-sheet posts found."
        );

        return;
    }

    console.log(
        `Found ${ranked.length} candidates. Showing top 30.`
    );

    for (
        const post of
        ranked.slice(
            0,
            30
        )
    ) {
        console.log("");
        console.log(
            "----------------------------------------"
        );

        console.log(
            `Score: ${post.score}`
        );

        console.log(
            `Date: ${post.date || "(unknown)"}`
        );

        console.log(
            `Author: ${post.author || "(unknown)"}`
        );

        console.log(
            `Post key: ${post.postKey || "(unknown)"}`
        );

        if (
            post.matchedTerms.length
        ) {
            console.log(
                `Terms: ${post.matchedTerms.join(", ")}`
            );
        }

        if (
            post.urls.length
        ) {
            console.log(
                "URLs:"
            );

            for (
                const url of
                post.urls
            ) {
                console.log(
                    `  ${url}`
                );
            }
        }

        const snippet =
            post.text.length >
            700
                ? `${post.text.slice(
                    0,
                    700
                )}...`
                : post.text;

        console.log(
            `Text: ${snippet}`
        );
    }
}

function printLikelyMissingAoSchedule(
    counts
) {
    console.log("");
    console.log(
        "MISSING WEBSITE AO INFERENCE"
    );
    console.log(
        "============================"
    );

    for (
        const ao of [
            "The Iron Gate",
            "The Knot",
        ]
    ) {
        console.log("");
        console.log(
            ao
        );

        const ranked =
            WEEKDAYS
                .map(
                    day => ({
                        day,
                        count:
                            counts[
                                ao
                            ][day],
                    })
                )
                .sort(
                    (a, b) =>
                        b.count -
                        a.count
                );

        for (
            const item of
            ranked
        ) {
            console.log(
                `  ${item.day.padEnd(9)} ${item.count}`
            );
        }

        const likelyDays =
            ranked
                .filter(
                    item =>
                        item.count >=
                        3
                )
                .map(
                    item =>
                        item.day
                );

        console.log(
            `  Likely recurring days: ${
                likelyDays.length
                    ? likelyDays.join(
                        ", "
                    )
                    : "unclear"
            }`
        );
    }
}

function main() {
    const parsedInput =
        loadJson(
            PARSED_PATH
        );

    const rawInput =
        loadJson(
            RAW_PATH
        );

    const parsedPosts =
        getParsedPosts(
            parsedInput
        );

    const rawPosts =
        getRawPosts(
            rawInput
        );

    console.log(
        `Loaded ${parsedPosts.length} parsed backblasts`
    );

    console.log(
        `Loaded ${rawPosts.length} raw BAND posts`
    );

    const weekdayCounts =
        buildAoWeekdayCounts(
            parsedPosts
        );

    printAoEvidence(
        weekdayCounts
    );

    printWebsiteComparison(
        weekdayCounts
    );

    printLikelyMissingAoSchedule(
        weekdayCounts
    );

    const schedulingPosts =
        findSchedulingPosts(
            rawPosts
        );

    printSchedulingPosts(
        schedulingPosts
    );
}

try {
    main();
} catch (error) {
    console.error("");
    console.error(
        "West Houston schedule analysis failed."
    );

    console.error(
        error?.message ||
        error
    );

    process.exit(1);
}