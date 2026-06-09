import {
    insertThangCandidates,
    loadHistoricalBackblastsForThangExtraction,
    mapSessionFromDb,
} from "./cloudData.js";

import { extractThangCandidatesFromSession } from "../utils/thangCandidateParser.js";

export async function generateHistoricalThangCandidatesForRegion(regionId) {
    const rows = await loadHistoricalBackblastsForThangExtraction(regionId);

    const candidates = rows.flatMap(row => {
        const session = mapSessionFromDb(row.sessions);

        return extractThangCandidatesFromSession({
            ...session,
            backblastText: row.cleaned_content || "",
            sourceBackblastLinkId: row.id,
        });
    });

    const inserted = await insertThangCandidates(regionId, candidates);

    return {
        backblastsChecked: rows.length,
        candidatesFound: candidates.length,
        candidatesInserted: inserted.length,
    };
}