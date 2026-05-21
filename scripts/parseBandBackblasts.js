import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_PATH = path.join(__dirname, "../import/band_backblasts.json");
const OUTPUT_DIR = path.join(__dirname, "../import/output");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "band_backblasts_parsed.json");
const MISSING_AO_PATH = path.join(OUTPUT_DIR, "missing_ao_samples.json");

const AO_HASHTAG_MAP = {
    "#theiron": "The Iron",
    "#iron": "The Iron",

    "#southie": "Southie",

    "#thekeep": "The Keep",
    "#keep": "The Keep",

    "#theforest": "The Forest",
    "#forest": "The Forest",

    "#thecave": "The Cave",
    "#cave": "The Cave",

    "#themoat": "The Moat",
    "#moat": "The Moat",

    "#thewatch": "The Watch",
    "#watch": "The Watch",

    "#thehub": "The Hub",
    "#hub": "The Hub",

    "#thedominion": "The Watch (D)",
    "#dominion": "The Watch (D)",

    "#therock": "The Rock",
    "#rock": "The Rock",

    "#themine": "The Mine",
    "#mine": "The Mine",

    "#convergence": "The Cave",

    "#f3dads": "Dads",
    "#dads": "Dads",

    "#f3franklin": "Franklin",
    "#franklin": "Franklin",
};

const AO_PHRASE_MAP = [
    { regex: /\bthe dominion\b/i, aoName: "The Watch (D)" },
    { regex: /\bthe rock\b/i, aoName: "The Rock" },
    { regex: /\bthe mine\b/i, aoName: "The Mine" },
    { regex: /\bthe iron\b/i, aoName: "The Iron" },
    { regex: /\bsouthie\b/i, aoName: "Southie" },
    { regex: /\bthe keep\b/i, aoName: "The Keep" },
    { regex: /\bthe forest\b/i, aoName: "The Forest" },
    { regex: /\bthe cave\b/i, aoName: "The Cave" },
    { regex: /\bthe moat\b/i, aoName: "The Moat" },
    { regex: /\bthe watch\b/i, aoName: "The Watch" },
    { regex: /\bthe hub\b/i, aoName: "The Hub" },
    { regex: /\bfranklin\b/i, aoName: "Franklin" },
    { regex: /\bthe ranch\b/i, aoName: "Franklin" },
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
    return [...new Set(matches.map(tag => tag.toLowerCase()))];
}

function extractBandMentions(content = "") {
    const mentionRegex = /<band:refer[^>]*user_key="([^"]+)"[^>]*>(.*?)<\/band:refer>/g;
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
    return String(aoName)
        .replace(/\s+Q:\s*.*$/i, "")
        .replace(/\s+Date:\s*.*$/i, "")
        .replace(/\s*@.*$/i, "")
        .replace(/\s*,.*$/i, "")
        .replace(/\s*\(Pebble Creek Elementary\)\s*$/i, "")
        .replace(/\s*\(Pebble Creek\)\s*$/i, "")
        .replace(/\s+TOWER\s*$/i, "")
        .trim();
}

function inferWorkoutType(hashtags = [], cleanedContent = "") {
    const text = cleanedContent.toLowerCase();

    if (hashtags.includes("#ruck") || text.includes("rucking") || text.includes("ruck")) {
        return "ruck";
    }

    if (hashtags.includes("#run") || text.includes("running")) {
        return "run";
    }

    if (hashtags.includes("#upper")) {
        return "upper";
    }

    if (hashtags.includes("#lower")) {
        return "lower";
    }

    if (hashtags.includes("#fullbody") || hashtags.includes("#full-body")) {
        return "full_body";
    }

    return "bootcamp";
}

function inferWorkoutDate(cleanedContent = "", createdAt) {
    const datePatterns = [
        /^Date:\s*(.+)$/im,
        /\bDate\s*[-:]\s*(.+)$/im,
        /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/i,
        /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/i,
        /\b[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/,
        /\b\d{4}-\d{2}-\d{2}\b/,
    ];

    for (const pattern of datePatterns) {
        const match = cleanedContent.match(pattern);

        if (!match) continue;

        const candidate = match[1] || match[0];
        const parsed = new Date(candidate.trim());

        if (!Number.isNaN(parsed.getTime())) {
            return {
                date: parsed.toISOString().slice(0, 10),
                source: "text_date",
                rawValue: candidate.trim(),
                confidence: 0.9,
            };
        }
    }

    return {
        date: formatCentralDate(createdAt),
        source: "post_created_at_central",
        rawValue: createdAt,
        confidence: 0.5,
    };
}

function classifyAoStatus(aoName, hashtags = [], cleanedContent = "") {
    const text = cleanedContent.toLowerCase();

    if (aoName) return "resolved";

    if (
        hashtags.includes("#blackops") ||
        hashtags.includes("#blackop") ||
        text.includes("black ops") ||
        text.includes("blackops")
    ) {
        return "black_ops";
    }

    if (
        text.includes("convergence") ||
        text.includes("csaup") ||
        text.includes("ruck") ||
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

function inferQNames(cleanedContent = "", authorName = "") {
    const qCandidates = [];

    const patterns = [
        /^Q:\s*@?(.+)$/im,
        /@([A-Za-z0-9.’' -]+)\s*(?:-|–)?\s*YHC\b/i,
        /@([A-Za-z0-9.’' -]+)\s*\((?:Q|YHC)\)/i,
        /@([A-Za-z0-9.’' -]+)\s+(?:Q|YHC)\b/i,
    ];

    for (const pattern of patterns) {
        const match = cleanedContent.match(pattern);

        if (!match) continue;

        const name = cleanQName(match[1]);

        if (name) {
            qCandidates.push({
                name,
                source: "text_q_marker",
                confidence: 0.9,
            });
        }
    }

    if (qCandidates.length > 0) {
        return {
            qNames: [...new Set(qCandidates.map(candidate => candidate.name))],
            source: qCandidates[0].source,
            confidence: qCandidates[0].confidence,
        };
    }

    return {
        qNames: authorName ? [authorName] : [],
        source: "author_fallback",
        confidence: 0.6,
    };
}

function cleanQName(name = "") {
    return String(name)
        .replace(/\bYHC\b/gi, "")
        .replace(/\bQ\b/gi, "")
        .replace(/[():✅]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function parseBackblast(post) {
    const rawContent = post.content || "";
    const cleanedContent = stripBandMarkup(rawContent);
    const hashtags = extractHashtags(rawContent);
    const mentions = extractBandMentions(rawContent);
    const ao = inferAoName(cleanedContent, hashtags);
    const cleanedAoName = cleanInferredAoName(ao.aoName);
    const workoutType = inferWorkoutType(hashtags, cleanedContent);
    const aoStatus = classifyAoStatus(cleanedAoName, hashtags, cleanedContent);
    const workoutDate = inferWorkoutDate(cleanedContent, post.created_at);
    const q = inferQNames(cleanedContent, post.author?.name || "");

    return {
        postKey: post.post_key,
        bandKey: post.band_key,
        createdAt: post.created_at,
        createdAtIso: new Date(post.created_at).toISOString(),
        authorName: post.author?.name || "",
        authorUserKey: post.author?.user_key || "",
        hashtags,
        mentions,
        aoName: cleanedAoName,
        workoutType,
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
        aoStatus,
        date: workoutDate.date,
        dateRawValue: workoutDate.rawValue,
        qNames: q.qNames,
        rawContent,
        cleanedContent,
    };
}

function main() {
    ensureOutputDir();

    const input = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
    const posts = input.posts || [];

    const parsedPosts = posts.map(parseBackblast);

    const missingAoSamples = parsedPosts
    .filter(post => !post.aoName)
    .slice(0, 100)
    .map(post => ({
        postKey: post.postKey,
        createdAtIso: post.createdAtIso,
        authorName: post.authorName,
        hashtags: post.hashtags,
        firstLines: post.cleanedContent
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .slice(0, 15),
    }));

    const output = {
        generatedAt: new Date().toISOString(),
        sourceFile: "band_backblasts.json",
        count: parsedPosts.length,
        posts: parsedPosts,
        summary: {
            withAo: parsedPosts.filter(post => post.aoName).length,
            withoutAo: parsedPosts.filter(post => !post.aoName).length,
            aoStatuses: parsedPosts.reduce((acc, post) => {
                acc[post.aoStatus] = (acc[post.aoStatus] || 0) + 1;
                return acc;
            }, {}),
            workoutTypes: parsedPosts.reduce((acc, post) => {
                acc[post.workoutType] = (acc[post.workoutType] || 0) + 1;
                return acc;
            }, {}),
            dateSources: parsedPosts.reduce((acc, post) => {
                acc[post.inferenceSources.date] = (acc[post.inferenceSources.date] || 0) + 1;
                return acc;
            }, {}),
            qSources: parsedPosts.reduce((acc, post) => {
                acc[post.inferenceSources.q] = (acc[post.inferenceSources.q] || 0) + 1;
                return acc;
            }, {}),
        },
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    fs.writeFileSync(MISSING_AO_PATH, JSON.stringify(missingAoSamples, null, 2));

    console.log(`Parsed ${parsedPosts.length} backblasts`);
    console.log(`With AO: ${output.summary.withAo}`);
    console.log(`Without AO: ${output.summary.withoutAo}`);
    console.log("AO Statuses:", output.summary.aoStatuses);
    console.log("Workout types:", output.summary.workoutTypes);
    console.log("Date sources:", output.summary.dateSources);
    console.log("Q sources:", output.summary.qSources);
    console.log(`Output written to ${OUTPUT_PATH}`);
}

main();