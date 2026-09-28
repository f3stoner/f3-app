import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, "../import/sactown/output/sactown_demo_manifest.json");
const REPORT_PATH = path.join(__dirname, "../import/sactown/output/sactown_demo_apply_report.json");
const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");
const INTERNAL_ADMIN_EMAIL = process.env.SACTOWN_INTERNAL_ADMIN_EMAIL || "f3stoner@gmail.com";
const CHUNK_SIZE = 100;
const REGION_SLUG = "sactown-demo";

function deterministicUuid(sourceKey) {
    const bytes = crypto.createHash("sha1").update(sourceKey).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function createSupabase() {
    assert(process.env.SUPABASE_URL, "Missing SUPABASE_URL");
    assert(process.env.SUPABASE_SERVICE_ROLE_KEY, "Missing SUPABASE_SERVICE_ROLE_KEY");
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

async function upsertChunks(client, table, rows, onConflict = "id") {
    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
        const { error } = await client.from(table).upsert(rows.slice(index, index + CHUNK_SIZE), { onConflict });
        if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    }
}

async function deleteIds(client, table, ids) {
    for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
        const { error } = await client.from(table).delete().in("id", ids.slice(index, index + CHUNK_SIZE));
        if (error) throw new Error(`${table} reset failed: ${error.message}`);
    }
}

async function resolveAdmin(client) {
    const { data, error } = await client
        .from("profiles")
        .select("id,email,role")
        .eq("email", INTERNAL_ADMIN_EMAIL);
    if (error) throw error;
    assert(data?.length === 1, `Expected one internal admin profile for ${INTERNAL_ADMIN_EMAIL}`);
    assert(data[0].role === "superadmin", `${INTERNAL_ADMIN_EMAIL} is not a superadmin`);
    return data[0];
}

const PRODUCTION_TABLES = [
    "members",
    "sessions",
    "aos",
    "sites",
    "q_slots",
    "ao_recurring_schedules",
    "region_participants",
    "member_stats",
    "campaigns",
    "region_feed_events",
];

const PRODUCTION_COUNT_COLUMNS = {
    member_stats: "member_id",
};

async function productionSnapshot(client) {
    const { data: regions, error } = await client
        .from("regions")
        .select("id,name")
        .eq("environment", "production")
        .order("id");
    if (error) throw error;
    const snapshot = {};
    for (const region of regions || []) {
        snapshot[region.id] = { name: region.name };
        for (const table of PRODUCTION_TABLES) {
            const countColumn = PRODUCTION_COUNT_COLUMNS[table] || "id";
            const { count, error: countError } = await client
                .from(table)
                .select(countColumn, { count: "exact", head: true })
                .eq("region_id", region.id);
            if (countError) throw new Error(`${table} production snapshot failed: ${countError.message}`);
            snapshot[region.id][table] = count || 0;
        }
    }
    return snapshot;
}

function validateManifest(manifest) {
    const expected = {
        historicalSessions: 36,
        sourcePostFlags: 239,
        sourceQSourceFlags: 45,
        rawSourceAttendanceFlags: 284,
        runtimeAttendanceRelationships: 265,
        uniquePax: 68,
        uniqueQs: 20,
        qAssignmentFlags: 36,
        fngRecords: 4,
        sites: 12,
        aos: 18,
        recurringSchedules: 18,
        prospectiveSlots: 36,
    };
    assert(JSON.stringify(manifest.summary) === JSON.stringify(expected), "Manifest control totals changed");
    assert(manifest.historicalPolicy.startDate === "2026-08-31", "Historical start changed");
    assert(manifest.historicalPolicy.endDate === "2026-09-12", "Historical end changed");
    assert(manifest.historicalPolicy.datesTransposed === false, "Historical dates were transposed");
    assert(manifest.optionalPartialPeriod.imported === false, "Partial September 14-15 period must remain excluded");
    assert(manifest.region.environment === "test", "SacTown must be a test region");
    assert(manifest.region.includeInReporting === false, "SacTown reporting must be disabled");
    assert(manifest.region.timezone === "America/Los_Angeles", "SacTown timezone changed");
    assert(manifest.prospectiveSlots.every(slot => slot.qUserId === null), "Prospective Q assignment detected");
    const scheduleKeys = new Set(manifest.schedules.map(schedule => schedule.sourceKey));
    assert(manifest.prospectiveSlots.every(slot => scheduleKeys.has(slot.scheduleSourceKey)), "Unsupported prospective cadence detected");
}

function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function buildWritePlan(manifest, admin, now) {
    const stagedParticipants = [];
    for (const session of manifest.sessions) {
        for (const memberId of session.attendeeIds) {
            const member = manifest.members.find(item => item.id === memberId);
            stagedParticipants.push({
                id: deterministicUuid(`sactown-demo:staged-participant:${session.sourceKey}:${memberId}:attendee`),
                staged_session_id: session.stagedSessionId,
                source_identity_id: member.sourceIdentityId,
                participant_role: "attendee",
                resolution_status: "resolved",
                canonical_member_id: memberId,
                source_data: { recordClass: "imported_historical" },
                updated_at: now,
            });
        }
        for (const memberId of session.qIds) {
            const member = manifest.members.find(item => item.id === memberId);
            stagedParticipants.push({
                id: deterministicUuid(`sactown-demo:staged-participant:${session.sourceKey}:${memberId}:q`),
                staged_session_id: session.stagedSessionId,
                source_identity_id: member.sourceIdentityId,
                participant_role: "q",
                resolution_status: "resolved",
                canonical_member_id: memberId,
                source_data: { recordClass: "imported_historical", rawQFlagsPreservedInSessionPayload: true },
                updated_at: now,
            });
        }
    }

    return {
        regions: [{
            id: manifest.region.id,
            name: manifest.region.name,
            slug: REGION_SLUG,
            environment: "test",
            lifecycle_status: "active",
            activated_at: now,
            activated_by_user_id: admin.id,
            lifecycle_updated_at: now,
            lifecycle_updated_by_user_id: admin.id,
            include_in_reporting: false,
            timezone: "America/Los_Angeles",
        }],
        region_import_projects: [{
            id: manifest.importProject.id,
            region_id: manifest.region.id,
            name: manifest.importProject.name,
            source_system: manifest.importProject.sourceSystem,
            status: "completed",
            parser_version: "sactown-demo-v1",
            matching_version: "explicit-test-identities-v1",
            expected_member_count: manifest.summary.uniquePax,
            expected_session_count: manifest.summary.historicalSessions,
            created_by_user_id: admin.id,
            completed_at: now,
            activated_at: now,
            updated_at: now,
        }],
        region_import_batches: [{
            id: manifest.importProject.batchId,
            project_id: manifest.importProject.id,
            batch_type: "historical_attendance",
            filename: manifest.source.filename,
            file_hash: manifest.source.sha256,
            source_format: "xlsx",
            status: "normalized",
            parser_version: "sactown-demo-v1",
            uploaded_by_user_id: admin.id,
            row_count: manifest.rawSourceRows.length,
        }],
        region_import_raw_rows: manifest.rawSourceRows.map(row => ({
            id: row.id,
            batch_id: manifest.importProject.batchId,
            row_number: row.rowNumber,
            source_key: row.sourceKey,
            raw_payload: row.payload,
            parse_status: "parsed",
        })),
        region_import_source_identities: manifest.members.map(member => ({
            id: member.sourceIdentityId,
            project_id: manifest.importProject.id,
            source_identity_key: member.sourceKey,
            display_name: member.paxName,
            source_f3_name: member.paxName,
            source_home_region: member.sourceRegions.join(", ") || null,
            normalized_f3_name: member.normalizedName,
            first_seen_date: member.firstSeenDate,
            last_seen_date: member.lastSeenDate,
            source_identity_status: "resolved",
            source_summary: { recordClass: "imported_historical", rosterRows: member.rosterRows },
            updated_at: now,
        })),
        members: manifest.members.map(member => ({
            id: member.id,
            region_id: manifest.region.id,
            pax_name: member.paxName,
            first_post_date: member.firstSeenDate,
            status: "active",
        })),
        region_import_identity_resolutions: manifest.members.map(member => ({
            id: deterministicUuid(`sactown-demo:identity-resolution:${member.sourceKey}`),
            source_identity_id: member.sourceIdentityId,
            resolution_type: "create_new",
            canonical_member_id: null,
            created_member_id: member.id,
            resolved_by_user_id: admin.id,
            notes: "Approved SacTown test-environment identity; no auth identity created.",
        })),
        sites: manifest.sites.map(site => ({
            id: site.id,
            region_id: manifest.region.id,
            name: site.name,
            address: site.address,
            weather_enabled: false,
            is_active: true,
        })),
        region_import_staged_sites: manifest.sites.map(site => ({
            id: site.id,
            project_id: manifest.importProject.id,
            source_key: site.sourceKey,
            name: site.name,
            address: site.address,
            weather_enabled: false,
            status: "committed",
            created_site_id: site.id,
            source_data: { recordClass: site.recordClass, sourceRows: site.sourceRows },
            updated_at: now,
        })),
        aos: manifest.aos.map(ao => {
            const schedule = manifest.schedules.find(item => item.aoId === ao.id);
            return {
                id: ao.id,
                region_id: manifest.region.id,
                name: ao.name,
                slug: slugify(ao.name),
                time: schedule.startTime,
                days_of_week: [schedule.weekday],
                time_schedule: { [schedule.weekday]: schedule.startTime },
                default_site_id: ao.siteId,
                location_name: manifest.sites.find(site => site.id === ao.siteId).name,
                weather_enabled: false,
                is_active: true,
                is_public: false,
            };
        }),
        region_import_staged_aos: manifest.aos.map(ao => ({
            id: ao.id,
            project_id: manifest.importProject.id,
            source_key: ao.sourceKey,
            name: ao.name,
            default_site_source_key: ao.siteSourceKey,
            is_active: true,
            status: "committed",
            created_ao_id: ao.id,
            source_data: { recordClass: ao.recordClass, sourceRow: ao.sourceRow, style: ao.style },
            updated_at: now,
        })),
        ao_recurring_schedules: manifest.schedules.map(schedule => ({
            id: schedule.id,
            region_id: manifest.region.id,
            ao_id: schedule.aoId,
            site_id: schedule.siteId,
            weekday: schedule.weekday,
            start_time: schedule.startTime,
            duration_minutes: schedule.durationMinutes,
            emphasis_rule: {},
            effective_start_date: schedule.effectiveStartDate,
            is_active: true,
        })),
        region_import_staged_schedules: manifest.schedules.map(schedule => ({
            id: schedule.id,
            project_id: manifest.importProject.id,
            source_key: schedule.sourceKey,
            ao_source_key: schedule.aoSourceKey,
            site_source_key: schedule.siteSourceKey,
            weekday: schedule.weekday,
            start_time: schedule.startTime,
            duration_minutes: schedule.durationMinutes,
            emphasis_rule: {},
            effective_start_date: schedule.effectiveStartDate,
            is_active: true,
            status: "committed",
            created_schedule_id: schedule.id,
            source_data: { recordClass: schedule.recordClass, sourceRow: schedule.sourceRow },
            updated_at: now,
        })),
        sessions: manifest.sessions.map(session => ({
            id: session.id,
            region_id: manifest.region.id,
            date: session.date,
            ao_name: session.aoName,
            ao_id: session.aoId,
            site_id: session.siteId,
            start_time: session.startTime,
            q_id: session.qIds[0] || null,
            q_ids: session.qIds,
            attendee_ids: session.attendeeIds,
            fngs: session.fngs,
            notes: null,
            workout: null,
            created_at: Date.parse(`${session.date}T12:00:00Z`),
            created_by_user_id: admin.id,
            backblast_text: "",
            backblast_status: null,
            attendance_review_status: "not_required",
        })),
        region_import_staged_sessions: manifest.sessions.map(session => ({
            id: session.stagedSessionId,
            project_id: manifest.importProject.id,
            batch_id: manifest.importProject.batchId,
            source_session_key: session.sourceKey,
            session_date: session.date,
            start_time: session.startTime,
            ao_source_key: session.aoSourceKey,
            site_source_key: session.siteSourceKey,
            resolved_ao_id: session.aoId,
            resolved_site_id: session.siteId,
            raw_payload: {
                recordClass: session.recordClass,
                sourceRows: session.sourceRows,
                postNames: session.postNames,
                qSourceNames: session.qSourceNames,
                sourcePostFlags: session.sourcePostFlags,
                sourceQSourceFlags: session.sourceQSourceFlags,
                sourceAttendanceFlags: session.sourceAttendanceFlags,
                runtimeAttendanceRelationships: session.runtimeAttendanceRelationships,
            },
            validation_status: "committed",
            duplicate_status: "new",
            created_session_id: session.id,
            updated_at: now,
        })),
        region_import_staged_session_participants: stagedParticipants,
        region_access: [{ user_id: admin.id, region_id: manifest.region.id }],
        q_slots: manifest.prospectiveSlots.map(slot => ({
            id: slot.id,
            region_id: manifest.region.id,
            ao_id: slot.aoId,
            site_id: slot.siteId,
            date: slot.date,
            start_time: slot.startTime,
            duration_minutes: slot.durationMinutes,
            q_user_id: null,
        })),
    };
}

async function fetchCurrentSchema() {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/openapi+json",
        },
    });
    if (!response.ok) throw new Error(`Schema preflight failed: HTTP ${response.status}`);
    return response.json();
}

async function validateWritePlan(writePlan) {
    const schema = await fetchCurrentSchema();
    const failures = [];
    const tables = [];
    for (const [table, rows] of Object.entries(writePlan)) {
        const definition = schema.definitions?.[table];
        if (!definition) {
            failures.push(`${table}: table is absent from the current API schema`);
            continue;
        }
        const properties = definition.properties || {};
        const required = definition.required || [];
        const requiredWithoutDefault = required.filter(column => !Object.hasOwn(properties[column] || {}, "default"));
        rows.forEach((row, index) => {
            const unknown = Object.keys(row).filter(column => !Object.hasOwn(properties, column));
            if (unknown.length) failures.push(`${table}[${index}]: unknown fields: ${unknown.join(", ")}`);
            const missing = requiredWithoutDefault.filter(column => !Object.hasOwn(row, column) || row[column] === null || row[column] === undefined);
            if (missing.length) failures.push(`${table}[${index}]: missing required fields: ${missing.join(", ")}`);
            const nullRequired = required.filter(column => Object.hasOwn(row, column) && (row[column] === null || row[column] === undefined));
            if (nullRequired.length) failures.push(`${table}[${index}]: null required fields: ${nullRequired.join(", ")}`);
        });
        tables.push({ table, rows: rows.length, requiredWithoutDefault });
    }
    assert(failures.length === 0, `Write preflight failed:\n${failures.join("\n")}`);
    return { schemaValidated: true, tables };
}

async function inspectExistingRegion(client, manifest) {
    const { data: byId, error } = await client.from("regions").select("*").eq("id", manifest.region.id);
    if (error) throw error;
    const { data: byName, error: nameError } = await client.from("regions").select("id,name").eq("name", manifest.region.name);
    if (nameError) throw nameError;
    const { data: bySlug, error: slugError } = await client.from("regions").select("id,name,slug").eq("slug", REGION_SLUG);
    if (slugError) throw slugError;
    assert(!byName?.length || byName.every(row => row.id === manifest.region.id), "Region name exists with a different id");
    assert(!bySlug?.length || bySlug.every(row => row.id === manifest.region.id), `Region slug ${REGION_SLUG} already belongs to another region`);
    if (byId?.length) {
        const row = byId[0];
        assert(row.name === manifest.region.name, "Deterministic region id belongs to another name");
        assert(row.environment === "test", "Existing deterministic region is not test");
    }
    return byId?.[0] || null;
}

async function resetDemo(client, manifest) {
    const confirmIndex = process.argv.indexOf("--confirm-region-id");
    assert(confirmIndex >= 0, "Reset requires --confirm-region-id <uuid>");
    assert(process.argv[confirmIndex + 1] === manifest.region.id, "Reset confirmation id does not match manifest");

    await deleteIds(client, "region_import_projects", [manifest.importProject.id]);
    await deleteIds(client, "q_slots", manifest.prospectiveSlots.map(row => row.id));
    await deleteIds(client, "sessions", manifest.sessions.map(row => row.id));
    await deleteIds(client, "ao_recurring_schedules", manifest.schedules.map(row => row.id));
    await deleteIds(client, "aos", manifest.aos.map(row => row.id));
    await deleteIds(client, "sites", manifest.sites.map(row => row.id));
    await deleteIds(client, "members", manifest.members.map(row => row.id));
    const { error: accessError } = await client.from("region_access").delete().eq("region_id", manifest.region.id);
    if (accessError) throw accessError;
    const { error: regionError } = await client.from("regions").delete().eq("id", manifest.region.id);
    if (regionError) throw regionError;
}

async function applyDemo(client, manifest, admin) {
    const before = await productionSnapshot(client);
    const now = new Date().toISOString();
    const writePlan = buildWritePlan(manifest, admin, now);
    await validateWritePlan(writePlan);

    await upsertChunks(client, "regions", writePlan.regions);
    await upsertChunks(client, "region_import_projects", writePlan.region_import_projects);
    await upsertChunks(client, "region_import_batches", writePlan.region_import_batches);
    await upsertChunks(client, "region_import_raw_rows", writePlan.region_import_raw_rows);
    await upsertChunks(client, "region_import_source_identities", writePlan.region_import_source_identities);
    await upsertChunks(client, "members", writePlan.members);
    await upsertChunks(client, "region_import_identity_resolutions", writePlan.region_import_identity_resolutions);
    await upsertChunks(client, "sites", writePlan.sites);
    await upsertChunks(client, "region_import_staged_sites", writePlan.region_import_staged_sites);
    await upsertChunks(client, "aos", writePlan.aos);
    await upsertChunks(client, "region_import_staged_aos", writePlan.region_import_staged_aos);
    await upsertChunks(client, "ao_recurring_schedules", writePlan.ao_recurring_schedules);
    await upsertChunks(client, "region_import_staged_schedules", writePlan.region_import_staged_schedules);
    await upsertChunks(client, "sessions", writePlan.sessions);
    await upsertChunks(client, "region_import_staged_sessions", writePlan.region_import_staged_sessions);
    await upsertChunks(client, "region_import_staged_session_participants", writePlan.region_import_staged_session_participants);
    await upsertChunks(client, "region_access", writePlan.region_access, "user_id,region_id");
    await upsertChunks(client, "q_slots", writePlan.q_slots);

    for (const session of manifest.sessions) {
        const { error: participantError } = await client.rpc("sync_region_participants_for_session", { p_session_id: session.id });
        if (participantError) throw new Error(`Participant sync failed for ${session.sourceKey}: ${participantError.message}`);
        const { error: feedError } = await client.rpc("reconcile_region_feed_for_session", { p_session_id: session.id });
        if (feedError) throw new Error(`Feed reconciliation failed for ${session.sourceKey}: ${feedError.message}`);
        const { error: achievementError } = await client.rpc("reconcile_region_feed_achievements_for_session", { p_session_id: session.id });
        if (achievementError) throw new Error(`Achievement reconciliation failed for ${session.sourceKey}: ${achievementError.message}`);
    }
    const { error: statsError } = await client.rpc("rebuild_member_stats_for_region", { target_region_id: manifest.region.id });
    if (statsError) throw new Error(`Stats rebuild failed: ${statsError.message}`);

    const after = await productionSnapshot(client);
    assert(JSON.stringify(before) === JSON.stringify(after), "Production-region counts changed during SacTown apply");
    return { before, after };
}

async function validateApplied(client, manifest) {
    const count = async (table) => {
        const { count: value, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("region_id", manifest.region.id);
        if (error) throw error;
        return value || 0;
    };
    const { data: region, error } = await client.from("regions").select("*").eq("id", manifest.region.id).single();
    if (error) throw error;
    const { data: sessions, error: sessionError } = await client.from("sessions").select("id,date,attendee_ids,q_ids,fngs").eq("region_id", manifest.region.id);
    if (sessionError) throw sessionError;
    const { data: slots, error: slotError } = await client.from("q_slots").select("id,q_user_id,date,ao_id,start_time,duration_minutes").eq("region_id", manifest.region.id);
    if (slotError) throw slotError;
    const result = {
        region: {
            id: region.id,
            name: region.name,
            environment: region.environment,
            lifecycleStatus: region.lifecycle_status,
            includeInReporting: region.include_in_reporting,
            timezone: region.timezone,
        },
        counts: {
            members: await count("members"),
            sites: await count("sites"),
            aos: await count("aos"),
            recurringSchedules: await count("ao_recurring_schedules"),
            sessions: sessions.length,
            runtimeAttendanceRelationships: sessions.reduce((sum, row) => sum + (row.attendee_ids || []).length, 0),
            runtimeQRelationships: sessions.reduce((sum, row) => sum + (row.q_ids || []).length, 0),
            fngs: sessions.reduce((sum, row) => sum + (row.fngs || []).length, 0),
            prospectiveSlots: slots.length,
            assignedProspectiveSlots: slots.filter(row => row.q_user_id).length,
            campaigns: await count("campaigns"),
        },
        historicalDates: [...new Set(sessions.map(row => row.date))].sort(),
        prospectiveDates: [...new Set(slots.map(row => row.date))].sort(),
    };
    assert(result.region.environment === "test", "Applied region environment mismatch");
    assert(result.region.lifecycleStatus === "active", "Applied lifecycle mismatch");
    assert(result.region.includeInReporting === false, "Applied reporting flag mismatch");
    assert(result.region.timezone === "America/Los_Angeles", "Applied timezone mismatch");
    assert(result.counts.members === 68, "Applied member count mismatch");
    assert(result.counts.sessions === 36, "Applied session count mismatch");
    assert(result.counts.runtimeAttendanceRelationships === 265, "Applied attendance mismatch");
    assert(result.counts.runtimeQRelationships === 36, "Applied Q mismatch");
    assert(result.counts.fngs === 4, "Applied FNG mismatch");
    assert(result.counts.sites === 12 && result.counts.aos === 18, "Applied structure mismatch");
    assert(result.counts.recurringSchedules === 18, "Applied recurring schedule mismatch");
    assert(result.counts.prospectiveSlots === 36 && result.counts.assignedProspectiveSlots === 0, "Applied prospective slot mismatch");
    assert(result.counts.campaigns === 0, "SacTown campaigns were unexpectedly created");
    assert(result.historicalDates[0] === "2026-08-31" && result.historicalDates.at(-1) === "2026-09-12", "Applied historical date range mismatch");
    return result;
}

async function main() {
    assert(!(APPLY && RESET), "Choose only one of --apply or --reset");
    const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
    validateManifest(manifest);
    const client = createSupabase();
    const existingRegion = await inspectExistingRegion(client, manifest);

    if (!APPLY && !RESET) {
        const admin = await resolveAdmin(client);
        const writePlan = buildWritePlan(manifest, admin, new Date().toISOString());
        const writePreflight = await validateWritePlan(writePlan);
        const production = await productionSnapshot(client);
        console.log(JSON.stringify({
            mode: "dry_run",
            existingRegion: Boolean(existingRegion),
            manifest: manifest.summary,
            region: { ...manifest.region, slug: REGION_SLUG },
            writePreflight,
            productionIsolationValidation: {
                snapshotReadable: true,
                productionRegionCount: Object.keys(production).length,
                tables: PRODUCTION_TABLES,
            },
        }, null, 2));
        return;
    }

    if (RESET) {
        await resetDemo(client, manifest);
        console.log(JSON.stringify({ mode: "reset", regionId: manifest.region.id, complete: true }, null, 2));
        return;
    }

    const admin = await resolveAdmin(client);
    const isolation = await applyDemo(client, manifest, admin);
    const validation = await validateApplied(client, manifest);
    const report = {
        appliedAt: new Date().toISOString(),
        internalAdmin: { id: admin.id, email: admin.email },
        manifestSummary: manifest.summary,
        rawQAssignmentFlags: 37,
        validation,
        productionIsolation: {
            unchanged: JSON.stringify(isolation.before) === JSON.stringify(isolation.after),
            before: isolation.before,
            after: isolation.after,
        },
        resetCommand: `node scripts/importSacTownDemo.js --reset --confirm-region-id ${manifest.region.id}`,
    };
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
});
