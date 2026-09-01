import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const INPUT_PATH =
    path.join(
        __dirname,
        "../import/west-houston/output/band_backblasts_parsed.json"
    );

const OUTPUT_PATH =
    path.join(
        __dirname,
        "../import/west-houston/output/west_houston_demo_manifest.json"
    );

const REGION_NAME =
    "F3 West Houston";

const REGION_SOURCE_KEY =
    "west-houston-demo:region";

const TEST_USER_EMAIL =
    "f3stoner@gmail.com";

const APPLY_MODE =
    process.argv.includes(
        "--apply"
    );

const SUPABASE_URL =
    process.env.PROJECT_SUPABASE_URL ||
    process.env.SUPABASE_URL;

const SERVICE_ROLE_KEY =
    process.env
        .PROJECT_SUPABASE_SERVICE_ROLE_KEY ||
    process.env
        .SUPABASE_SERVICE_ROLE_KEY;

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

function normalizeName(
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

function cleanDisplayName(
    value = ""
) {
    return String(value)
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

const AO_NAME_MAP =
    new Map(
        CANONICAL_AOS.map(
            name => [
                normalizeName(
                    name
                ),
                name,
            ]
        )
    );

function canonicalizeAoName(
    value = ""
) {
    return (
        AO_NAME_MAP.get(
            normalizeName(
                value
            )
        ) || null
    );
}

function ensureParentDirectory(
    filePath
) {
    const dir =
        path.dirname(
            filePath
        );

    if (
        !fs.existsSync(
            dir
        )
    ) {
        fs.mkdirSync(
            dir,
            {
                recursive: true,
            }
        );
    }
}

function loadInput() {
    assert(
        fs.existsSync(
            INPUT_PATH
        ),
        `Input file does not exist: ${INPUT_PATH}`
    );

    const raw =
        fs.readFileSync(
            INPUT_PATH,
            "utf8"
        );

    const input =
        JSON.parse(raw);

    assert(
        Array.isArray(
            input.posts
        ),
        "Input does not contain a posts array."
    );

    assert(
        input.posts.length >
            0,
        "Input contains no posts."
    );

    return input;
}

function getBandUserSourceKey(
    bandKey,
    userKey
) {
    return [
        "west-houston-demo",
        "member",
        bandKey,
        userKey,
    ].join(":");
}

function buildIdentityIndex(
    posts
) {
    const identities =
        new Map();

    function observe({
        bandKey,
        userKey,
        name,
        timestamp,
        role,
    }) {
        if (
            !bandKey ||
            !userKey
        ) {
            return;
        }

        const externalKey =
            `${bandKey}:${userKey}`;

        const cleanedName =
            cleanDisplayName(
                name
            );

        let identity =
            identities.get(
                externalKey
            );

        if (!identity) {
            identity = {
                bandKey,
                userKey,

                names:
                    new Map(),

                latestName:
                    "",

                latestTimestamp:
                    0,

                observedAsAuthor:
                    false,

                observedAsMention:
                    false,
            };

            identities.set(
                externalKey,
                identity
            );
        }

        if (cleanedName) {
            identity.names.set(
                cleanedName,
                (
                    identity.names.get(
                        cleanedName
                    ) || 0
                ) + 1
            );

            const numericTimestamp =
                new Date(
                    timestamp ||
                        0
                ).getTime();

            if (
                numericTimestamp >=
                identity
                    .latestTimestamp
            ) {
                identity
                    .latestTimestamp =
                    numericTimestamp;

                identity
                    .latestName =
                    cleanedName;
            }
        }

        if (
            role ===
            "author"
        ) {
            identity
                .observedAsAuthor =
                true;
        }

        if (
            role ===
            "mention"
        ) {
            identity
                .observedAsMention =
                true;
        }
    }

    for (
        const post of
        posts
    ) {
        observe({
            bandKey:
                post.bandKey,

            userKey:
                post.authorUserKey,

            name:
                post.authorName,

            timestamp:
                post.createdAtIso ||
                post.createdAt,

            role:
                "author",
        });

        for (
            const mention of
            post.mentions || []
        ) {
            observe({
                bandKey:
                    post.bandKey,

                userKey:
                    mention.userKey,

                name:
                    mention.name,

                timestamp:
                    post.createdAtIso ||
                    post.createdAt,

                role:
                    "mention",
            });
        }
    }

    return identities;
}

function chooseDisplayName(
    identity
) {
    if (
        identity.latestName
    ) {
        return identity
            .latestName;
    }

    const names = [
        ...identity
            .names
            .entries(),
    ].sort(
        (a, b) =>
            b[1] -
            a[1]
    );

    if (
        names.length >
        0
    ) {
        return names[0][0];
    }

    return "Unknown PAX";
}

function buildMembers(
    identities
) {
    const members = [];

    for (
        const [
            externalKey,
            identity,
        ] of identities
    ) {
        const sourceKey =
            getBandUserSourceKey(
                identity.bandKey,
                identity.userKey
            );

        members.push({
            id:
                deterministicUuid(
                    sourceKey
                ),

            sourceKey,

            bandKey:
                identity.bandKey,

            bandUserKey:
                identity.userKey,

            paxName:
                chooseDisplayName(
                    identity
                ),

            observedNames: [
                ...identity
                    .names
                    .keys(),
            ],

            externalIdentityKey:
                externalKey,
        });
    }

    members.sort(
        (a, b) =>
            a.paxName
                .localeCompare(
                    b.paxName
                )
    );

    return members;
}

function buildMemberLookup(
    members
) {
    return new Map(
        members.map(
            member => [
                member
                    .externalIdentityKey,
                member,
            ]
        )
    );
}

function buildNameIndex(
    identities
) {
    const nameIndex =
        new Map();

    for (
        const [
            externalKey,
            identity,
        ] of identities
    ) {
        for (
            const name of
            identity
                .names
                .keys()
        ) {
            const normalized =
                normalizeName(
                    name
                );

            if (!normalized) {
                continue;
            }

            if (
                !nameIndex.has(
                    normalized
                )
            ) {
                nameIndex.set(
                    normalized,
                    new Set()
                );
            }

            nameIndex
                .get(
                    normalized
                )
                .add(
                    externalKey
                );
        }
    }

    return nameIndex;
}

function resolveQName({
    post,
    qName,
    nameIndex,
    memberLookup,
}) {
    const normalizedQName =
        normalizeName(
            qName
        );

    if (!normalizedQName) {
        return {
            status:
                "unresolved",

            reason:
                "empty_q_name",

            qName,
        };
    }

    if (
        post
            .inferenceSources
            ?.q ===
            "author_fallback" &&
        post.authorUserKey &&
        post.bandKey
    ) {
        const externalKey =
            `${post.bandKey}:${post.authorUserKey}`;

        const member =
            memberLookup.get(
                externalKey
            );

        if (member) {
            return {
                status:
                    "resolved",

                method:
                    "author_user_key",

                qName,

                memberId:
                    member.id,
            };
        }
    }

    const postMatches = [];

    for (
        const mention of
        post.mentions || []
    ) {
        if (
            normalizeName(
                mention.name
            ) !==
            normalizedQName
        ) {
            continue;
        }

        if (
            !mention.userKey ||
            !post.bandKey
        ) {
            continue;
        }

        const externalKey =
            `${post.bandKey}:${mention.userKey}`;

        if (
            memberLookup.has(
                externalKey
            )
        ) {
            postMatches.push(
                externalKey
            );
        }
    }

    const uniqueMatches = [
        ...new Set(
            postMatches
        ),
    ];

    if (
        uniqueMatches.length ===
        1
    ) {
        return {
            status:
                "resolved",

            method:
                "current_post_mention_name",

            qName,

            memberId:
                memberLookup.get(
                    uniqueMatches[0]
                ).id,
        };
    }

    if (
        normalizeName(
            post.authorName
        ) ===
            normalizedQName &&
        post.authorUserKey &&
        post.bandKey
    ) {
        const externalKey =
            `${post.bandKey}:${post.authorUserKey}`;

        const member =
            memberLookup.get(
                externalKey
            );

        if (member) {
            return {
                status:
                    "resolved",

                method:
                    "current_post_author_name",

                qName,

                memberId:
                    member.id,
            };
        }
    }

    const candidates = [
        ...(
            nameIndex.get(
                normalizedQName
            ) ||
            new Set()
        ),
    ];

    if (
        candidates.length ===
        1
    ) {
        const member =
            memberLookup.get(
                candidates[0]
            );

        if (member) {
            return {
                status:
                    "resolved",

                method:
                    "unique_global_name",

                qName,

                memberId:
                    member.id,
            };
        }
    }

    return {
        status:
            candidates.length >
            1
                ? "ambiguous"
                : "unresolved",

        reason:
            candidates.length >
            1
                ? "multiple_global_name_matches"
                : "no_band_identity_match",

        qName,

        candidates,
    };
}

function buildRegion() {
    return {
        id:
            deterministicUuid(
                REGION_SOURCE_KEY
            ),

        name:
            REGION_NAME,

        includeInReporting:
            false,
    };
}

function buildSites(
    region
) {
    return CANONICAL_AOS.map(
        aoName => {
            const sourceKey =
                `west-houston-demo:site:${normalizeName(
                    aoName
                )}`;

            return {
                id:
                    deterministicUuid(
                        sourceKey
                    ),

                regionId:
                    region.id,

                name:
                    aoName,

                aoName,
            };
        }
    );
}

function buildAos(
    region,
    sites
) {
    const siteByAo =
        new Map(
            sites.map(
                site => [
                    site.aoName,
                    site,
                ]
            )
        );

    return CANONICAL_AOS.map(
        aoName => {
            const sourceKey =
                `west-houston-demo:ao:${normalizeName(
                    aoName
                )}`;

            return {
                id:
                    deterministicUuid(
                        sourceKey
                    ),

                regionId:
                    region.id,

                name:
                    aoName,

                defaultSiteId:
                    siteByAo.get(
                        aoName
                    )?.id ||
                    null,
            };
        }
    );
}

function buildSessions({
    posts,
    region,
    aos,
    sites,
    nameIndex,
    memberLookup,
}) {
    const aoByName =
        new Map(
            aos.map(
                ao => [
                    ao.name,
                    ao,
                ]
            )
        );

    const siteByAoName =
        new Map(
            sites.map(
                site => [
                    site.aoName,
                    site,
                ]
            )
        );

    const sessions = [];
    const skippedPosts = [];
    const qIssues = [];

    for (
        const post of
        posts
    ) {
        const aoName =
            canonicalizeAoName(
                post.aoName
            );

        if (!aoName) {
            skippedPosts.push({
                postKey:
                    post.postKey,

                date:
                    post.date,

                parsedAoName:
                    post.aoName,
            });

            continue;
        }

        const ao =
            aoByName.get(
                aoName
            );

        const site =
            siteByAoName.get(
                aoName
            );

        assert(
            ao,
            `Missing AO: ${aoName}`
        );

        assert(
            site,
            `Missing site: ${aoName}`
        );

        assert(
            post.postKey,
            "Post missing postKey"
        );

        assert(
            post.bandKey,
            `Post ${post.postKey} missing bandKey`
        );

        const attendeeIds =
            new Set();

        for (
            const mention of
            post.mentions || []
        ) {
            if (
                !mention.userKey
            ) {
                continue;
            }

            const member =
                memberLookup.get(
                    `${post.bandKey}:${mention.userKey}`
                );

            if (member) {
                attendeeIds.add(
                    member.id
                );
            }
        }

        const qIds =
            new Set();

        for (
            const qName of
            post.qNames || []
        ) {
            const result =
                resolveQName({
                    post,
                    qName,
                    nameIndex,
                    memberLookup,
                });

            if (
                result.status ===
                "resolved"
            ) {
                qIds.add(
                    result.memberId
                );

                attendeeIds.add(
                    result.memberId
                );
            } else {
                qIssues.push({
                    postKey:
                        post.postKey,

                    date:
                        post.date,

                    aoName,

                    ...result,
                });
            }
        }

        const sourceKey = [
            "west-houston-demo",
            "session",
            post.bandKey,
            post.postKey,
        ].join(":");

        sessions.push({
            id:
                deterministicUuid(
                    sourceKey
                ),

            regionId:
                region.id,

            aoId:
                ao.id,

            aoName,

            siteId:
                site.id,

            date:
                post.date,

            createdAtIso:
                post.createdAtIso,

            qMemberIds: [
                ...qIds,
            ].sort(),

            attendeeMemberIds: [
                ...attendeeIds,
            ].sort(),

            backblastText:
                post.cleanedContent ||
                "",
        });
    }

    return {
        sessions,
        skippedPosts,
        qIssues,
    };
}

function buildSummary({
    members,
    sessions,
    skippedPosts,
    qIssues,
}) {
    const aoSessionDistribution =
        {};

    let sessionsWithQ = 0;
    let attendanceCount = 0;

    for (
        const session of
        sessions
    ) {
        aoSessionDistribution[
            session.aoName
        ] =
            (
                aoSessionDistribution[
                    session.aoName
                ] || 0
            ) + 1;

        if (
            session
                .qMemberIds
                .length
        ) {
            sessionsWithQ++;
        }

        attendanceCount +=
            session
                .attendeeMemberIds
                .length;
    }

    return {
        aoCount:
            CANONICAL_AOS.length,

        memberCount:
            members.length,

        sessionCount:
            sessions.length,

        sessionsWithQ,

        sessionsWithoutQ:
            sessions.length -
            sessionsWithQ,

        attendanceCount,

        skippedPostCount:
            skippedPosts.length,

        unresolvedQCount:
            qIssues.filter(
                issue =>
                    issue.status ===
                    "unresolved"
            ).length,

        ambiguousQCount:
            qIssues.filter(
                issue =>
                    issue.status ===
                    "ambiguous"
            ).length,

        aoSessionDistribution,
    };
}

function printSummary(
    summary
) {
    console.log("");
    console.log(
        "WEST HOUSTON TESTER"
    );

    console.log(
        "==================="
    );

    console.log(
        `AOs: ${summary.aoCount}`
    );

    console.log(
        `Members: ${summary.memberCount}`
    );

    console.log(
        `Sessions: ${summary.sessionCount}`
    );

    console.log(
        `Sessions with Q: ${summary.sessionsWithQ}`
    );

    console.log(
        `Sessions without Q: ${summary.sessionsWithoutQ}`
    );

    console.log(
        `Attendance assignments: ${summary.attendanceCount}`
    );

    console.log(
        `Unresolved Qs: ${summary.unresolvedQCount}`
    );

    console.log(
        `Ambiguous Qs: ${summary.ambiguousQCount}`
    );

    console.log(
        `Skipped posts: ${summary.skippedPostCount}`
    );

    console.log("");

    for (
        const [
            aoName,
            count,
        ] of Object.entries(
            summary
                .aoSessionDistribution
        ).sort(
            (a, b) =>
                b[1] -
                a[1]
        )
    ) {
        console.log(
            `  ${aoName}: ${count}`
        );
    }
}

function createSupabaseClient() {
    assert(
        SUPABASE_URL,
        "Missing Supabase URL"
    );

    assert(
        SERVICE_ROLE_KEY,
        "Missing Supabase service role key"
    );

    return createClient(
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
}

async function upsertRows({
    supabase,
    table,
    rows,
    onConflict = "id",
}) {
    if (!rows.length) {
        return;
    }

    const {
        error,
    } = await supabase
        .from(table)
        .upsert(
            rows,
            {
                onConflict,
            }
        );

    if (error) {
        throw new Error(
            `${table} upsert failed: ${error.message}`
        );
    }
}

async function applyDemo(
    manifest
) {
    const supabase =
        createSupabaseClient();

    console.log("");
    console.log(
        "SEEDING WEST HOUSTON..."
    );

    const {
        data: profiles,
        error: profileError,
    } = await supabase
        .from("profiles")
        .select(
            "id,email,role"
        )
        .eq(
            "email",
            TEST_USER_EMAIL
        );

    if (profileError) {
        throw new Error(
            profileError.message
        );
    }

    assert(
        profiles?.length ===
            1,
        `Could not uniquely resolve ${TEST_USER_EMAIL}`
    );

    const profile =
        profiles[0];

    assert(
        profile.role ===
            "superadmin",
        `${TEST_USER_EMAIL} is not a superadmin`
    );

    await upsertRows({
        supabase,
        table:
            "regions",

        rows: [
            {
                id:
                    manifest.region.id,

                name:
                    manifest.region.name,

                include_in_reporting:
                    false,
            },
        ],
    });

    console.log(
        "Region ready."
    );

    await upsertRows({
        supabase,
        table:
            "sites",

        rows:
            manifest.sites.map(
                site => ({
                    id:
                        site.id,

                    region_id:
                        manifest.region.id,

                    name:
                        site.name,

                    weather_enabled:
                        false,

                    is_active:
                        true,
                })
            ),
    });

    console.log(
        "Sites ready."
    );

    await upsertRows({
        supabase,
        table:
            "aos",

        rows:
            manifest.aos.map(
                ao => ({
                    id:
                        ao.id,

                    region_id:
                        manifest.region.id,

                    name:
                        ao.name,

                    time:
                        "",

                    default_site_id:
                        ao.defaultSiteId,

                    weather_enabled:
                        false,

                    is_active:
                        true,
                })
            ),
    });

    console.log(
        "AOs ready."
    );

    await upsertRows({
        supabase,
        table:
            "members",

        rows:
            manifest.members.map(
                member => ({
                    id:
                        member.id,

                    region_id:
                        manifest.region.id,

                    pax_name:
                        member.paxName,

                    status:
                        "active",
                })
            ),
    });

    console.log(
        `Members ready: ${manifest.members.length}`
    );

    const sessionRows =
        manifest.sessions.map(
            session => {
                const qIds = [
                    ...session
                        .qMemberIds,
                ];

                const attendeeIds = [
                    ...new Set([
                        ...session
                            .attendeeMemberIds,
                        ...qIds,
                    ]),
                ];

                const createdAt =
                    new Date(
                        session.createdAtIso
                    ).getTime();

                assert(
                    Number.isFinite(
                        createdAt
                    ),
                    `Invalid createdAt for session ${session.id}`
                );

                return {
                    id:
                        session.id,

                    region_id:
                        manifest.region.id,

                    date:
                        session.date,

                    ao_id:
                        session.aoId,

                    site_id:
                        session.siteId,

                    ao_name:
                        session.aoName,

                    q_id:
                        qIds[0] ||
                        null,

                    q_ids:
                        qIds,

                    attendee_ids:
                        attendeeIds,

                    fngs:
                        [],

                    unresolved_pax:
                        [],

                    created_at:
                        createdAt,

                    backblast_text:
                        session.backblastText,

                    backblast_status:
                        "posted_elsewhere",

                    backblast_posted_at:
                        session.createdAtIso,

                    attendance_review_status:
                        "not_required",

                    notes:
                        "West Houston tester import",
                };
            }
        );

    for (
        let i = 0;
        i <
        sessionRows.length;
        i += 50
    ) {
        await upsertRows({
            supabase,
            table:
                "sessions",

            rows:
                sessionRows.slice(
                    i,
                    i + 50
                ),
        });

        console.log(
            `Sessions: ${Math.min(
                i + 50,
                sessionRows.length
            )}/${sessionRows.length}`
        );
    }

    await upsertRows({
        supabase,
        table:
            "region_access",

        rows: [
            {
                user_id:
                    profile.id,

                region_id:
                    manifest.region.id,
            },
        ],

        onConflict:
            "user_id,region_id",
    });

    console.log(
        `Access ready for ${TEST_USER_EMAIL}`
    );

    console.log(
        "Rebuilding stats..."
    );

    const {
        error: statsError,
    } = await supabase.rpc(
        "rebuild_member_stats_for_region",
        {
            target_region_id:
                manifest.region.id,
        }
    );

    if (statsError) {
        throw new Error(
            `Stats rebuild failed: ${statsError.message}`
        );
    }

    console.log("");
    console.log(
        "WEST HOUSTON TESTER READY"
    );

    console.log(
        "========================="
    );

    console.log(
        `Region: ${manifest.region.name}`
    );

    console.log(
        `AOs: ${manifest.aos.length}`
    );

    console.log(
        `Members: ${manifest.members.length}`
    );

    console.log(
        `Sessions: ${manifest.sessions.length}`
    );

    console.log(
        `Tester: ${TEST_USER_EMAIL}`
    );
}

async function main() {
    const input =
        loadInput();

    console.log(
        `Loaded ${input.posts.length} parsed West Houston backblasts`
    );

    assert(
        input.posts.length ===
            320,
        `Expected 320 parsed posts, found ${input.posts.length}`
    );

    const region =
        buildRegion();

    const sites =
        buildSites(
            region
        );

    const aos =
        buildAos(
            region,
            sites
        );

    const identities =
        buildIdentityIndex(
            input.posts
        );

    const members =
        buildMembers(
            identities
        );

    const memberLookup =
        buildMemberLookup(
            members
        );

    const nameIndex =
        buildNameIndex(
            identities
        );

    const {
        sessions,
        skippedPosts,
        qIssues,
    } = buildSessions({
        posts:
            input.posts,

        region,
        aos,
        sites,
        nameIndex,
        memberLookup,
    });

    assert(
        sessions.length ===
            314,
        `Expected 314 sessions, found ${sessions.length}`
    );

    assert(
        skippedPosts.length ===
            6,
        `Expected 6 skipped posts, found ${skippedPosts.length}`
    );

    const summary =
        buildSummary({
            members,
            sessions,
            skippedPosts,
            qIssues,
        });

    printSummary(
        summary
    );

    const manifest = {
        generatedAt:
            new Date().toISOString(),

        mode:
            APPLY_MODE
                ? "apply"
                : "dry_run",

        source: {
            system:
                "band",

            parsedPostCount:
                input.posts.length,
        },

        region,
        sites,
        aos,
        members,
        sessions,
        skippedPosts,
        qIssues,
        summary,
    };

    ensureParentDirectory(
        OUTPUT_PATH
    );

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(
            manifest,
            null,
            2
        )
    );

    console.log("");
    console.log(
        `Manifest written to: ${OUTPUT_PATH}`
    );

    if (
        APPLY_MODE
    ) {
        await applyDemo(
            manifest
        );
    } else {
        console.log("");
        console.log(
            "Dry run only. Use --apply to seed the tester."
        );
    }
}

main().catch(
    error => {
        console.error("");
        console.error(
            APPLY_MODE
                ? "West Houston tester import failed."
                : "West Houston tester dry run failed."
        );

        console.error(
            error?.message ||
            error
        );

        process.exit(1);
    }
);