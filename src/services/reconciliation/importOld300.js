import { parseOld300Csv } from './parseOld300Csv';
import { loadProductionSnapshot } from './loadProductionSnapshot';

export async function importOld300(csvText, regionId) {
    const spreadsheet = parseOld300Csv(csvText);

    const production = await loadProductionSnapshot(regionId);

    const membersByName = new Map();

    for (const member of production.members) {
        membersByName.set(
            normalize(member.pax_name),
            member
        );
    }

    const sessionsByKey = new Map();

    for (const session of production.sessions) {
        sessionsByKey.set(
            buildSessionKey(session.date, session.ao_name),
            session
        );
    }

    

    return {
        membersCreated: 0,
        sessionsCreated: 0,
        sessionsSkipped: 0,
        warnings: [],
    };
}