import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_PATH = path.join(
    __dirname,
    "../import/west-houston/band_backblasts.json"
);

const OUTPUT_DIR = path.join(
    __dirname,
    "../import/west-houston/output"
);

const OUTPUT_PATH = path.join(
    OUTPUT_DIR,
    "band_backblasts_parsed.json"
);

const MISSING_AO_PATH = path.join(
    OUTPUT_DIR,
    "missing_ao_samples.json"
);

const AO_HASHTAG_MAP = {
    "#thepoint": "The Point",

    "#thehop": "The HOP",

    "#thetower": "The Tower",
    "#tower": "The Tower",

    "#thebranch": "The Branch",

    "#thecorridor": "The Corridor",
    "#corridor": "The Corridor",

    "#theknot": "The Knot",

    "#theirongate": "The Iron Gate",
    "#irongate": "The Iron Gate",

    "#theoasis": "The Oasis",
    "#oasis": "The Oasis",

    "#thevalley": "The Valley",

    "#valhalla": "Valhalla",

    "#hallofpain": "The HOP",
    "#thehallofpain": "The HOP",
};

const AO_PHRASE_MAP = [
    { regex: /\bthe point\b/i, aoName: "The Point" },

    { regex: /\bthe hop\b/i, aoName: "The HOP" },
    { regex: /\bhall of pain\b/i, aoName: "The HOP" },

    { regex: /\bthe tower\b/i, aoName: "The Tower" },

    { regex: /\bthe branch\b/i, aoName: "The Branch" },

    { regex: /\bthe corridor\b/i, aoName: "The Corridor" },

    { regex: /\bthe knot\b/i, aoName: "The Knot" },

    { regex: /\bthe iron gate\b/i, aoName: "The Iron Gate" },
    { regex: /\birongate\b/i, aoName: "The Iron Gate" },

    { regex: /\bthe oasis\b/i, aoName: "The Oasis" },

    { regex: /\bthe valley\b/i, aoName: "The Valley" },

    { regex: /\bvalhalla\b/i, aoName: "Valhalla" },
];

function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

function stripBandMarkup(content = "") {
    return String(content)
        .replace(/<band:refer[^>]*>(.*?)<\/band:refer>/g, "$1")
        .replace(/<\/?band:refer_members[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}

function extractHashtags(content = "") {
    const matches = String(content).match(/#[\w-]+/g) || [];

    return [
        ...new Set(
            matches.map(tag => tag.toLowerCase())
        ),
    ];
}

function extractBandMentions(content = "") {
    const mentionRegex =
        /<band:refer[^>]*user_key="([^"]+)"[^>]*>(.*?)<\/band:refer>/g;

    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push({
            userKey: match[1],
            name: stripBandMarkup(match[2]).trim(),
        });
    }

    return mentions;
}

function inferAoName(cleanedContent = "", hashtags = []) {
    const aoLineMatch = cleanedContent.match(/^AO:\s*(.+)$/im);

    if (aoLineMatch) {
        return {
            aoName: aoLineMatch[1].trim(),
            source: "ao_line",
            confidence: 0.95,
        };
    }

    for (const tag of hashtags) {
        if (AO_HASHTAG_MAP[tag]) {
            return {
                aoName: AO_HASHTAG_MAP[tag],
                source: "hashtag",
                confidence: 0.9,
            };
        }
    }

    const searchText = cleanedContent.slice(0, 1200);

    for (const item of AO_PHRASE_MAP) {
        if (item.regex.test(searchText)) {
            return {
                aoName: item.aoName,
                source: "phrase",
                confidence: 0.75,
            };
        }
    }

    return {
        aoName: null,
        source: null,
        confidence: 0,
    };
}

function cleanInferredAoName(aoName = "") {
    if (!aoName) return null;

    return String(aoName)
        .replace(/\s+Q:\s*.*$/i, "")
        .replace(/\s+Date:\s*.*$/i, "")
        .replace(/\s*@.*$/i, "")
        .replace(/\s*,.*$/i, "")
        .trim() || null;
}

function normalizeAoName(aoName) {
    if (!aoName) return null;

    const normalized = aoName.trim().toLowerCase();

    const aliases = {
        "the hop": "The HOP",
        "hop": "The HOP",
        "hall of pain": "The HOP",

        "the point": "The Point",
        "point": "The Point",

        "the tower": "The Tower",
        "tower": "The Tower",

        "the branch": "The Branch",
        "branch": "The Branch",

        "the corridor": "The Corridor",
        "corridor": "The Corridor",

        "the knot": "The Knot",
        "knot": "The Knot",

        "the iron gate": "The Iron Gate",
        "iron gate": "The Iron Gate",
        "irongate": "The Iron Gate",

        "the oasis": "The Oasis",
        "oasis": "The Oasis",

        "the valley": "The Valley",
        "valley": "The Valley",

        "valhalla": "Valhalla",
    };

    return aliases[normalized] || aoName.trim();
}

function inferWorkoutType(
    hashtags = [],
    cleanedContent = ""
) {
    const text = cleanedContent.toLowerCase();

    if (
        hashtags.includes("#ruck") ||
        hashtags.includes("#ruckwednesday") ||
        hashtags.includes("#ruckday")
    ) {
        return "ruck";
    }

    if (
        hashtags.includes("#run") ||
        hashtags.includes("#runruck")
    ) {
        return "run";
    }

    if (
        hashtags.includes("#upperbody") ||
        hashtags.includes("#upper")
    ) {
        return "upper";
    }

    if (
        hashtags.includes("#lowerbody") ||
        hashtags.includes("#lowerbodybd") ||
        hashtags.includes("#lowerbodyday") ||
        hashtags.includes("#legday") ||
        hashtags.includes("#legs") ||
        hashtags.includes("#lower")
    ) {
        return "lower";
    }

    if (
        hashtags.includes("#fullbody") ||
        hashtags.includes("#fullbodyworkout") ||
        hashtags.includes("#full-body")
    ) {
        return "full_body";
    }

    if (
        hashtags.includes("#cardio") ||
        hashtags.includes("#cardioday") ||
        hashtags.includes("#cardiocore") ||
        hashtags.includes("#coreandcardio")
    ) {
        return "cardio";
    }

    if (
        hashtags.includes("#core") ||
        hashtags.includes("#coreday") ||
        hashtags.includes("#corecrusher")
    ) {
        return "core";
    }

    if (
        hashtags.includes("#sandbag") ||
        hashtags.includes("#sandbagbeatdown") ||
        hashtags.includes("#sb")
    ) {
        return "sandbag";
    }

    if (/\bruck(?:ing)?\b/i.test(text)) {
        return "ruck";
    }

    if (/\bsandbag(?:s)?\b/i.test(text)) {
        return "sandbag";
    }

    return "unknown";
}

function inferWorkoutDate(
    cleanedContent = "",
    createdAt
) {
    const datePatterns = [
        /^Date:\s*(.+)$/im,
        /\bDate\s*[-:]\s*(.+)$/im,

        /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/i,

        /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/i,

        /\b[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/,

        /\b\d{4}-\d{2}-\d{2}\b/,

        /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
    ];

    for (const pattern of datePatterns) {
        const match = cleanedContent.match(pattern);

        if (!match) continue;

        const candidate = match[1] || match[0];
        const parsed = new Date(candidate.trim());

        if (!Number.isNaN(parsed.getTime())) {
            const postDate =
                new Date(createdAt);
        
            const differenceMs =
                Math.abs(
                    parsed.getTime() -
                    postDate.getTime()
                );
        
            const differenceDays =
                differenceMs /
                (1000 * 60 * 60 * 24);
        
            if (differenceDays <= 7) {
                return {
                    date:
                        parsed
                            .toISOString()
                            .slice(0, 10),
        
                    source:
                        "text_date",
        
                    rawValue:
                        candidate.trim(),
        
                    confidence:
                        0.9,
                };
            }
        }
    }

    return {
        date: formatCentralDate(createdAt),
        source: "post_created_at_central",
        rawValue: createdAt,
        confidence: 0.5,
    };
}

function classifyAoStatus(
    aoName,
    hashtags = [],
    cleanedContent = ""
) {
    const text = cleanedContent.toLowerCase();

    if (aoName) {
        return "resolved";
    }

    if (
        hashtags.includes("#blackops") ||
        hashtags.includes("#blackop") ||
        hashtags.includes("#otb") ||
        text.includes("black ops") ||
        text.includes("blackops")
    ) {
        return "black_ops";
    }

    if (
        hashtags.includes("#convergence") ||
        hashtags.includes("#csaup") ||
        hashtags.includes("#f3ftx") ||
        text.includes("convergence") ||
        text.includes("csaup") ||
        text.includes("murph") ||
        text.includes("special event")
    ) {
        return "special_event";
    }

    return "unresolved";
}

function formatCentralDate(timestamp) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(timestamp));
}

function inferQNames(
    cleanedContent = "",
    authorName = ""
) {
    const patterns = [
        /^Q:\s*@?([A-Za-z0-9.’' -]{1,40})\s*$/im,
        /^QIC:\s*@?([A-Za-z0-9.’' -]{1,40})\s*$/im,
        /@([A-Za-z0-9.’' -]{1,40})\s*(?:-|–)?\s*YHC\b/i,
        /@([A-Za-z0-9.’' -]{1,40})\s*\((?:Q|YHC)\)/i,
    ];

    for (const pattern of patterns) {
        const match =
            cleanedContent.match(pattern);

        if (!match) continue;

        const name =
            cleanQName(match[1]);

        if (
            name &&
            name.length <= 40
        ) {
            return {
                qNames: [name],
                source:
                    "text_q_marker",
                confidence: 0.9,
            };
        }
    }

    return {
        qNames:
            authorName
                ? [authorName]
                : [],

        source:
            "author_fallback",

        confidence:
            authorName
                ? 0.6
                : 0,
    };
}

function cleanQName(name = "") {
    return String(name)
        .replace(/\bYHC\b/gi, "")
        .replace(/\bQIC\b/gi, "")
        .replace(/\bQ\b/gi, "")
        .replace(/[():✅]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseBackblast(post) {
    const rawContent = post.content || "";

    const cleanedContent =
        stripBandMarkup(rawContent);

    const hashtags =
        extractHashtags(rawContent);

    const mentions =
        extractBandMentions(rawContent);

    const ao =
        inferAoName(
            cleanedContent,
            hashtags
        );

    const cleanedAoName =
        normalizeAoName(
            cleanInferredAoName(
                ao.aoName
            )
        );

    const workoutType =
        inferWorkoutType(
            hashtags,
            cleanedContent
        );

    const aoStatus =
        classifyAoStatus(
            cleanedAoName,
            hashtags,
            cleanedContent
        );

    const workoutDate =
        inferWorkoutDate(
            cleanedContent,
            post.created_at
        );

    const q =
        inferQNames(
            cleanedContent,
            post.author?.name || ""
        );

    return {
        postKey: post.post_key,
        bandKey: post.band_key,

        createdAt: post.created_at,
        createdAtIso:
            new Date(
                post.created_at
            ).toISOString(),

        authorName:
            post.author?.name || "",

        authorUserKey:
            post.author?.user_key || "",

        hashtags,
        mentions,

        aoName: cleanedAoName,
        aoStatus,

        workoutType,

        date: workoutDate.date,
        dateRawValue:
            workoutDate.rawValue,

        qNames: q.qNames,

        confidence: {
            ao: ao.confidence,
            date: workoutDate.confidence,
            q: q.confidence,
        },

        inferenceSources: {
            ao: ao.source,
            date: workoutDate.source,
            q: q.source,
        },

        rawContent,
        cleanedContent,
    };
}

function main() {
    ensureOutputDir();

    const input =
        JSON.parse(
            fs.readFileSync(
                INPUT_PATH,
                "utf8"
            )
        );

    const posts =
        input.posts || [];

    const parsedPosts =
        posts.map(parseBackblast);

    const missingAoSamples =
        parsedPosts
            .filter(
                post => !post.aoName
            )
            .slice(0, 100)
            .map(post => ({
                postKey:
                    post.postKey,

                createdAtIso:
                    post.createdAtIso,

                authorName:
                    post.authorName,

                hashtags:
                    post.hashtags,

                firstLines:
                    post.cleanedContent
                        .split("\n")
                        .map(
                            line =>
                                line.trim()
                        )
                        .filter(Boolean)
                        .slice(0, 15),
            }));

    const aoCounts =
        parsedPosts.reduce(
            (acc, post) => {
                const key =
                    post.aoName ||
                    "(unresolved)";

                acc[key] =
                    (acc[key] || 0) + 1;

                return acc;
            },
            {}
        );

    const output = {
        generatedAt:
            new Date().toISOString(),

        region:
            "F3 West Houston",

        sourceFile:
            "west-houston/band_backblasts.json",

        count:
            parsedPosts.length,

        posts:
            parsedPosts,

        summary: {
            withAo:
                parsedPosts.filter(
                    post => post.aoName
                ).length,

            withoutAo:
                parsedPosts.filter(
                    post => !post.aoName
                ).length,

            aoCounts,

            aoStatuses:
                parsedPosts.reduce(
                    (acc, post) => {
                        acc[post.aoStatus] =
                            (
                                acc[
                                    post.aoStatus
                                ] || 0
                            ) + 1;

                        return acc;
                    },
                    {}
                ),

            workoutTypes:
                parsedPosts.reduce(
                    (acc, post) => {
                        acc[
                            post.workoutType
                        ] =
                            (
                                acc[
                                    post.workoutType
                                ] || 0
                            ) + 1;

                        return acc;
                    },
                    {}
                ),

            dateSources:
                parsedPosts.reduce(
                    (acc, post) => {
                        const source =
                            post
                                .inferenceSources
                                .date;

                        acc[source] =
                            (
                                acc[source] ||
                                0
                            ) + 1;

                        return acc;
                    },
                    {}
                ),

            qSources:
                parsedPosts.reduce(
                    (acc, post) => {
                        const source =
                            post
                                .inferenceSources
                                .q;

                        acc[source] =
                            (
                                acc[source] ||
                                0
                            ) + 1;

                        return acc;
                    },
                    {}
                ),
        },
    };

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(
            output,
            null,
            2
        )
    );

    fs.writeFileSync(
        MISSING_AO_PATH,
        JSON.stringify(
            missingAoSamples,
            null,
            2
        )
    );

    console.log(
        `Parsed ${parsedPosts.length} West Houston backblasts`
    );

    console.log(
        `With AO: ${output.summary.withAo}`
    );

    console.log(
        `Without AO: ${output.summary.withoutAo}`
    );

    console.log(
        "AO counts:",
        output.summary.aoCounts
    );

    console.log(
        "AO statuses:",
        output.summary.aoStatuses
    );

    console.log(
        "Workout types:",
        output.summary.workoutTypes
    );

    console.log(
        "Date sources:",
        output.summary.dateSources
    );

    console.log(
        "Q sources:",
        output.summary.qSources
    );

    console.log(
        `Output written to ${OUTPUT_PATH}`
    );
}

main();