import { insertMember, updateMemberInCloud, insertSessionsBatch, updateSessionInCloud, insertAdminFlags, mapMemberFromDb } from "./cloudData.js"
import Papa from "papaparse";
import { supabase } from "./supabaseClient.js";
import { normalizePaxName, normalizeImportPaxKey } from "../utils/historicImport.js";
import { state } from "../modules/state.js";

export async function importPaxMasterCsv(csvText) {
    let reusedCount = 0;
    let insertedCount = 0;

    const { data: rows, errors } = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (errors.length) {
        console.error(errors);
        throw new Error("CSV parse failed");
    }

    console.log("Importing Pax Master:", rows.length);

    const csvCollisions = findCsvPaxNameCollisions(rows);

    if (csvCollisions.length) {
        throwCsvCollisionError(csvCollisions, "Pax Master import");
    }

    function findCsvPaxNameCollisions(rows) {
        const grouped = {};
    
        rows.forEach(row => {
            const paxName = (row["Name"] || "").trim();
            if (!paxName) return;
    
            const normalizedName = normalizeImportPaxKey(paxName);
            grouped[normalizedName] ||= [];
            grouped[normalizedName].push({
                paxName,
                realName: row["Hospital Name"]?.trim() || null,
                homeAo: row["First AO"]?.trim() || null,
            });
        });
    
        return Object.entries(grouped)
            .filter(([, entries]) => entries.length > 1)
            .map(([normalizedName, entries]) => ({
                normalizedName,
                entries,
            }));
    }
    
    function throwCsvCollisionError(collisions, context = "Pax Master import") {
        console.table(collisions.map(collision => ({
            normalizedName: collision.normalizedName,
            matches: collision.entries.map(entry => entry.paxName).join(", "),
        })));
    
        throw new Error(
            `${context} blocked: ${collisions.length} duplicate PAX name(s) found in CSV. No data was imported.`
        );
    
    }

    const existingMemberMap = await buildMemberNameToMemberMap(state.currentRegionId);
    
    const memberMap = {};

    for (const row of rows) {
        const paxName = (row["Name"] || "").trim();
        if (!paxName) continue;

        const normalizedPaxName = normalizeImportPaxKey(paxName);
        const existingMember = existingMemberMap[normalizedPaxName];

        if (existingMember) {
            memberMap[normalizedPaxName] = existingMember;
            reusedCount += 1;
            continue;
        }

        const member = {
            id: crypto.randomUUID(),
            paxName,
            realName: row["Hospital Name"]?.trim() || null,
            homeAo: row["First AO"]?.trim() || null,
            invitedById: null,
            firstPostDate: normalizeDate(row["FNG Date"]),
            status: "active",
        };

        const saved = await insertMember(state.currentRegionId, member);
        memberMap[normalizedPaxName] = saved;
        insertedCount += 1;

    }

    console.log("Pass 1 complete:", {
        totalMapped: Object.keys(memberMap).length,
        reusedCount,
        insertedCount,
});

    for (const row of rows) {
        const paxName = (row["Name"] || "").trim();
        const invitedByName = (row["Proud Papa"] || "").trim();

        if (!paxName || !invitedByName) continue;

        const member = memberMap[normalizeImportPaxKey(paxName)];
        const inviter = memberMap[normalizeImportPaxKey(invitedByName)];

        if (!member || !inviter) continue;

        member.invitedById = inviter.id;

        await updateMemberInCloud(state.currentRegionId, member);
    }

    console.log("Pass 2 complete (invitedBy)");

    return memberMap;
}

async function buildMemberNameToMemberMap(regionId = state.currentRegionId) {
    const lookup = await buildUniqueMemberLookup(regionId);
    return lookup.memberByNormalizedName;
}

function normalizeDate(value) {
    if (!value) return null;

    const trimmed = String(value).trim();

    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
        let [, month, day, year] = match;

        if (year.length === 2) {
            year = `20${year}`;
        }

        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const date = new Date(trimmed);
    if (isNaN(date)) return null;

    return date.toISOString().split("T")[0];
}

function createCollisionKey(memberIds) {
    return [...memberIds].sort().join("|");
}

async function loadExistingOpenMemberCollisionFlags(regionId) {

    const { data, error } = await supabase
        .from("admin_flags")
        .select("*")
        .eq("region_id", regionId)
        .eq("type", "member_name_collision")
        .eq("status", "open");

    if (error) throw error;

    const existingKeys = new Set();

    (data || []).forEach(flag => {
        existingKeys.add(createCollisionKey(flag.matched_member_ids || []));
    });

    return existingKeys;
}

async function createMemberCollisionFlags(regionId, collisions, context = "import") {
    if (!collisions.length) return [];

    const existingFlagKeys = await loadExistingOpenMemberCollisionFlags(regionId);

    const flagsToCreate = collisions
        .filter(collision => {
            const key = createCollisionKey(collision.members.map(member => member.id));

            return !existingFlagKeys.has(key);
        })
        .map(collision => ({
            id: crypto.randomUUID(),
            type: "member_name_collision",
            status: "open",
            severity: "high",
            createdAt: Date.now(),
            createdByUserId: state.currentUserId || null,
            sessionId: null,
            proposedPaxName: collision.normalizedName,
            matchedMemberIds: collision.members.map(member => member.id),
            message: `${context} blocked: multiple members normalize to "${collision.normalizedName}": ${collision.members.map(member => member.paxName).join(", ")}`,
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionNotes: null,
        }));

    if (!flagsToCreate.length) return [];

    return insertAdminFlags(regionId, flagsToCreate);
}

function throwMemberCollisionError(collisions, context = "Import") {
    console.table(collisions.map(collision => ({
        normalizedName: collision.normalizedName,
        matches: collision.members.map(member => member.paxName).join(", "),
        memberIds: collision.members.map(member => member.id).join(", "),
    })));

    throw new Error(
        `${context} blocked: ${collisions.length} member name collision(s) require admin review. No data was imported.`
    );
}

async function buildUniqueMemberLookup(regionId = state.currentRegionId) {
    const pageSize = 1000;
    let from = 0;
    let allMembers = [];

    while (true) {
        const { data, error } = await supabase
            .from("members")
            .select("*")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;

        if (!data || data.length === 0) break;

        allMembers = allMembers.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const grouped = {};

    for (const row of allMembers) {
        const member = mapMemberFromDb(row);
        const normalizedName = normalizePaxName(member.paxName);
        grouped[normalizedName] ||= [];
        grouped[normalizedName].push(member);
    }

    const memberByNormalizedName = {};
    const collisions = [];

    Object.entries(grouped).forEach(([normalizedName, members]) => {
        if (members.length === 1) {
            memberByNormalizedName[normalizedName] = members[0];
            return;
        }

        collisions.push({
            normalizedName,
            members,
        });
    });

    return {
        memberByNormalizedName,
        collisions,
    };
}

async function assertNoMemberNameCollisions(regionId, context) {
    const lookup = await buildUniqueMemberLookup(regionId);

    if (lookup.collisions.length) {

        await createMemberCollisionFlags(regionId, lookup.collisions, context);
        throwMemberCollisionError(lookup.collisions, context);
    }

    return lookup;
}

async function loadExistingSessionsByDeltaKey(regionId) {
    const pageSize = 1000;
    let from = 0;
    let existingSessions = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select("*")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        existingSessions = existingSessions.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const map = {};

    for (const row of existingSessions) {
        const key = `${normalizeAoName(row.ao_name)}|${row.date}`;

        map[key] = {
            id: row.id,
            date: row.date,
            aoName: row.ao_name,
            attendeeIds: row.attendee_ids || [],
            qIds: row.q_ids || (row.q_id ? [row.q_id] : []),
            fngs: row.fngs || [],
            notes: row.notes || "",
            workout: row.workout || null,
            sourcePlannedWorkoutId: row.source_planned_workout_id,
            createdAt: row.created_at,
            createdByUserId: row.created_by_user_id,
            backblastText: row.backblast_text || "",
            unresolvedPax: row.unresolved_pax || [],
        };
    }
    
    return map;
}

export async function repairAggielandDeltaSessions({ dryRun = true, regionId = state.currentRegionId } = {}) {
    const targetRegionId = regionId;

    const aoFiles = [
        ["Forest", "/Forest_Log.csv"],
        ["Cave", "/Cave_Log.csv"],
        ["Iron", "/Iron_Log.csv"],
        ["Keep", "/Keep_Log.csv"],
        ["Rock", "/Rock_Log.csv"],
        ["Mine", "/Mine_Log.csv"],
        ["Southie", "/Southie_Log.csv"],
        ["Watch", "/Watch_Log.csv"],
        ["Dads", "/Dads_Log.csv"],
        ["BlackOps", "/BlackOps_Log.csv"],
        ["CSAUP", "/CSAUP_Log.csv"],
        ["Other", "/Other_Log.csv"],
    ];

    console.log(`Aggieland session repair starting. dryRun = ${dryRun}`);

    const existingSessionMap = await loadExistingSessionsByDeltaKey(targetRegionId);

    let repairCandidates = [];
    let missingExistingSessions = [];

    for (const [aoName, path] of aoFiles) {
        const response = await fetch(path);

        if (!response.ok) {
            console.warn(`Skipping ${aoName}. Could not fetch ${path}`);
            continue;
        }

        const csvText = await response.text();
        const parsedSessions = await parseAoLogCsvToSessions(csvText, aoName, targetRegionId);

        for (const parsedSession of parsedSessions) {
            const key = sessionDeltaKey(parsedSession);
            const existingSession = existingSessionMap[key];

            if (!existingSession) {
                missingExistingSessions.push(parsedSession);
                continue;
            }

            const existingAttendees = existingSession.attendeeIds || [];
            const parsedAttendees = parsedSession.attendeeIds || [];

            const existingQs = existingSession.qIds || [];
            const parsedQs = parsedSession.qIds || [];

            const existingFngs = existingSession.fngs || [];
            const parsedFngs = parsedSession.fngs || [];
            
            const mergedUnresolvedPax = [
                ...(existingSession.unresolvedPax || []),
            ];

            for (const unresolved of parsedSession.unresolvedPax || []) {
                const alreadyExists = mergedUnresolvedPax.some(existing =>
                    existing.rawName === unresolved.rawName &&
                    existing.normalizedName === unresolved.normalizedName &&
                    existing.code === unresolved.code &&
                    existing.reason === unresolved.reason
                );

                if (!alreadyExists) {
                    mergedUnresolvedPax.push(unresolved);
                }
            }

            const unresolvedChanged = mergedUnresolvedPax.length !== (existingSession.unresolvedPax || []).length;

            const mergedAttendeeIds = Array.from(new Set([
                ...existingAttendees,
                ...parsedAttendees,
            ]));

            const mergedQIds = Array.from(new Set([
                ...existingQs,
                ...parsedQs,
            ]));

            const mergedFngs = [...existingFngs];

            for (const fng of parsedFngs) {
                const alreadyExists = mergedFngs.some(existingFng =>
                    existingFng.memberId === fng.memberId ||
                    normalizePaxName(existingFng.paxName) === normalizePaxName(fng.paxName)
                );

                if (!alreadyExists) {
                    mergedFngs.push(fng);
                }
            }

            const attendeeChanged = mergedAttendeeIds.length !== existingAttendees.length ||
                mergedAttendeeIds.some(id => !existingAttendees.includes(id));
            const qChanged = mergedQIds.length !== existingQs.length ||
                mergedQIds.some(id => !existingQs.includes(id));
            const fngChanged = mergedFngs.length !== existingFngs.length;

            if (!attendeeChanged && !qChanged && !fngChanged && !unresolvedChanged) continue;

            const repairedSession = {
                ...existingSession,
                attendeeIds: mergedAttendeeIds,
                qIds: mergedQIds,
                fngs: mergedFngs,
                unresolvedPax: mergedUnresolvedPax,
            };

            repairCandidates.push({
                key,
                aoName: parsedSession.aoName,
                date: parsedSession.date,
                existingAttendeeCount: existingAttendees.length,
                repairedAttendeeCount: mergedAttendeeIds.length,
                existingQCount: existingQs.length,
                repairedQCount: mergedQIds.length,
                existingFngCount: existingFngs.length,
                repairedFngCount: mergedFngs.length,
                addedFngs: parsedFngs
                    .filter(fng => !existingFngs.some(existingFng =>
                        existingFng.memberId === fng.memberId ||
                        normalizePaxName(existingFng.paxName) === normalizePaxName(fng.paxName)
                    ))
                    .map(fng => fng.paxName),
                repairedSession,
            });
        }
    }

    console.log("Aggieland session repair summary:");
    console.log("Repair candidates:", repairCandidates.length);
    console.log("CSV sessions missing from DB:", missingExistingSessions.length);

    console.table(repairCandidates.map(candidate => ({
        aoName: candidate.aoName,
        date: candidate.date,
        attendees: `${candidate.existingAttendeeCount} → ${candidate.repairedAttendeeCount}`,
        qCount: `${candidate.existingQCount} → ${candidate.repairedQCount}`,
        fngCount: `${candidate.existingFngCount} → ${candidate.repairedFngCount}`,
        addedFngs: candidate.addedFngs.join(", "),
    })));

    if (dryRun) {

        console.log("Dry run only. No sessions updated.");

        return {
            dryRun,
            repairCandidates,
            missingExistingSessions,
        };
    }

    for (const candidate of repairCandidates) {
        await updateSessionInCloud(targetRegionId, candidate.repairedSession);
    }

    await createUnresolvedPaxFlagsForSessions(
        targetRegionId,
        repairCandidates.map(candidate => candidate.repairedSession)
    );

    console.log(`Updated ${repairCandidates.length} sessions.`);

    return {
        dryRun,
        updated: repairCandidates.length,
        repairCandidates,
        missingExistingSessions,
    };
}

export async function parseAoLogCsvToSessions(csvText, aoName, regionId = state.currentRegionId) {
    const cleanedCsvText = csvText.split("\n").slice(1).join("\n");
    const { data: rows, errors } = Papa.parse(cleanedCsvText, {
        header: true,
        skipEmptyLines: true,
    });

    if (errors.length) {
        console.error(errors);
        throw new Error(`CSV parse failed for ${aoName}`);
    }

    console.log(`Parsing ${aoName} rows:`, rows.length);

    const { memberIdByName, ambiguousMembersByName } = await buildMemberImportLookup(regionId);
    const grouped = {};

    for (const row of rows) {
        const rawDate = (row["Date"] || "").trim();
        const paxName = (row["Pax"] || "").trim();
        const code = (row["Code"] || "").trim().toUpperCase();

        if (!rawDate || !paxName) continue;

        const normalizedDate = normalizeDate(rawDate);

        if (!normalizedDate) continue;

        const normalizedPaxName = normalizePaxName(paxName);
        const memberId = memberIdByName[normalizedPaxName];
        const ambiguousMembers = ambiguousMembersByName[normalizedPaxName] || [];

        const key = normalizedDate;

        if (!grouped[key]) {
            grouped[key] = {
                id: crypto.randomUUID(),
                date: normalizedDate,
                aoName,
                attendeeIds: [],
                qIds: [],
                fngs: [],
                unresolvedPax: [],
                notes: "",
                workout: null,
                sourcePlannedWorkoutId: null,
                createdAt: Date.now(),
            };
        }

        if (!memberId) {
            const reason = ambiguousMembers.length
                ? "ambiguous_member_reference"
                : "unmatched_member_reference";

            grouped[key].unresolvedPax.push({
                rawName: paxName,
                normalizedName: normalizedPaxName,
                code,
                reason,
                candidateMemberIds: ambiguousMembers.map(member => member.id),
            });

            console.warn(`Unresolved pax in ${aoName} on ${normalizedDate}:`, {
                paxName,
                reason,
                candidateMemberIds: ambiguousMembers.map(member => member.id),
            });

            continue;
        }

        if (!grouped[key].attendeeIds.includes(memberId)) {
            grouped[key].attendeeIds.push(memberId);
        }

        const normalizedCode = code.replace(/[^A-Z]/g, "");
        const isQCode = normalizedCode.includes("Q");

        if (isQCode) {
            if (!grouped[key].qIds.includes(memberId)) {
                grouped[key].qIds.push(memberId);
            }
        }

        if (code === "FNG") {
            grouped[key].fngs.push({
                paxName,
                memberId,
            });
        }
    }
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

export async function importAoLogCsv(csvText, aoName) {
    const sessions = await parseAoLogCsvToSessions(csvText, aoName);

    console.log(`${aoName} sessions grouped:`, sessions.length);

    const savedSessions = await insertSessionsBatch(state.currentRegionId, sessions);

    await createUnresolvedPaxFlagsForSessions(
        state.currentRegionId,
        savedSessions
    );

    console.log(`${aoName} session import complete`);
}

function normalizeAoName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^the\s+/, "");
}

function sessionDeltaKey(session) {
    return `${normalizeAoName(session.aoName)}|${session.date}`;
}

async function loadExistingSessionKeysForRegion(regionId) {
    const pageSize = 1000;
    let from = 0;
    let existingSessions = [];

    while (true) {
        const { data, error } = await supabase
            .from("sessions")
            .select("id, date, ao_name")
            .eq("region_id", regionId)
            .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        existingSessions = existingSessions.concat(data);

        if (data.length < pageSize) break;
        from += pageSize;
    }

    const keys = new Set();

    for (const row of existingSessions) {
        keys.add(`${normalizeAoName(row.ao_name)}|${row.date}`);
    }

    return keys;
}

export async function runAggielandDeltaAoImports({ dryRun = true, regionId = state.currentRegionId }  = {}) {
    const targetRegionId = regionId;

    const aoFiles = [
        ["Forest", "/Forest_Log.csv"],
        ["Cave", "/Cave_Log.csv"],
        ["Iron", "/Iron_Log.csv"],
        ["Keep", "/Keep_Log.csv"],
        ["Rock", "/Rock_Log.csv"],
        ["Mine", "/Mine_Log.csv"],
        ["Southie", "/Southie_Log.csv"],
        ["Watch", "/Watch_Log.csv"],
        ["Dads", "/Dads_Log.csv"],
        ["BlackOps", "/BlackOps_Log.csv"],
        ["CSAUP", "/CSAUP_Log.csv"],
        ["Other", "/Other_Log.csv"],
    ];

    console.log(`Aggieland delta import starting. dryRun = ${dryRun}`);

    const existingKeys = await loadExistingSessionKeysForRegion(targetRegionId);
    let allNewSessions = [];
    let totalParsed = 0;
    let totalDuplicates = 0;

    for (const [aoName, path] of aoFiles) {
        const response = await fetch(path);

        if (!response.ok) {
            console.warn(`Skipping ${aoName}. Could not fetch ${path}`);
            continue;
        }

        const csvText = await response.text();
        const sessions = await parseAoLogCsvToSessions(csvText, aoName, targetRegionId);
        const newSessions = [];
        const duplicateSessions = [];

        for (const session of sessions) {
            const key = sessionDeltaKey(session);

            if (existingKeys.has(key)) {
                duplicateSessions.push(session);

            } else {
                newSessions.push(session);
            }
        }

        totalParsed += sessions.length;
        totalDuplicates += duplicateSessions.length;
        allNewSessions = allNewSessions.concat(newSessions);

        console.log(`AO: ${aoName}`);
        console.log(`CSV sessions found: ${sessions.length}`);
        console.log(`New sessions to insert: ${newSessions.length}`);
        console.log(`Duplicates skipped: ${duplicateSessions.length}`);

        if (newSessions.length) {
            console.table(newSessions.map(session => ({
                aoName: session.aoName,
                date: session.date,
                qCount: session.qIds.length,
                attendees: session.attendeeIds.length,
            })));
        }
    }

    console.log("Aggieland delta import summary:");
    console.log("Total parsed:", totalParsed);
    console.log("Total duplicates skipped:", totalDuplicates);
    console.log("Total new sessions:", allNewSessions.length);

    if (dryRun) {
        console.log("Dry run only. No sessions inserted.");

        return {
            dryRun,
            totalParsed,
            totalDuplicates,
            totalNewSessions: allNewSessions.length,
            newSessions: allNewSessions,
        };
    }

    if (allNewSessions.length === 0) {
        console.log("No new sessions to insert.");

        return {
            dryRun,
            totalParsed,
            totalDuplicates,
            totalNewSessions: 0,
            inserted: 0,
        };
    }

    const savedSessions = await insertSessionsBatch(targetRegionId, allNewSessions);

    await createUnresolvedPaxFlagsForSessions(
        targetRegionId,
        savedSessions
    );

    console.log(`Inserted ${allNewSessions.length} new sessions.`);

    return {
        dryRun,
        totalParsed,
        totalDuplicates,
        totalNewSessions: allNewSessions.length,
        inserted: allNewSessions.length,
    };
}

async function buildMemberImportLookup(regionId = state.currentRegionId) {
    const lookup = await buildUniqueMemberLookup(regionId);

    const memberIdByName = {};
    const ambiguousMembersByName = {};

    Object.entries(lookup.memberByNormalizedName).forEach(([normalizedName, member]) => {
        memberIdByName[normalizedName] = member.id;
    });

    lookup.collisions.forEach(collision => {
        ambiguousMembersByName[collision.normalizedName] = collision.members;
    });

    return {
        memberIdByName,
        ambiguousMembersByName,
    };
}

async function createUnresolvedPaxFlagsForSessions(regionId, sessions) {
    const flags = [];

    const sessionIds = sessions
        .map(session => session.id)
        .filter(Boolean);

    if (!sessionIds.length) return [];

    const { data: existingFlags, error } = await supabase
        .from("admin_flags")
        .select("session_id, proposed_pax_name, type, status")
        .eq("region_id", regionId)
        .eq("status", "open")
        .in("session_id", sessionIds);

    if (error) throw error;

    const existingFlagKeys = new Set(
        (existingFlags || []).map(flag =>
            `${flag.session_id}|${flag.proposed_pax_name}|${flag.type}`
        )
    );

    for (const session of sessions) {
        const unresolvedPax = session.unresolvedPax || session.unresolved_pax || [];

        for (const unresolved of unresolvedPax) {
            const flagKey = `${session.id}|${unresolved.rawName}|${unresolved.reason}`;

            if (existingFlagKeys.has(flagKey)) continue;

            existingFlagKeys.add(flagKey);

            flags.push({
                id: crypto.randomUUID(),
                type: unresolved.reason,
                status: "open",
                severity: "high",
                createdAt: Date.now(),
                createdByUserId: state.currentUserId || null,
                sessionId: session.id,
                proposedPaxName: unresolved.rawName,
                matchedMemberIds: unresolved.candidateMemberIds || [],
                message: `${session.aoName || session.ao_name} ${session.date}: could not safely assign ${unresolved.rawName} (${unresolved.code || "no code"}).`,
                resolvedAt: null,
                resolvedByUserId: null,
                resolutionNotes: null,
            });
        }
    }

    if (!flags.length) return [];

    return insertAdminFlags(regionId, flags);
}