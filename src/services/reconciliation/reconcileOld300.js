import { parseOld300Csv } from './parseOld300Csv';
import { loadProductionSnapshot } from './loadProductionSnapshot';
import { matchMembers } from './matchMembers';

export async function reconcileOld300(csvText, regionId) {
    const spreadsheet = parseOld300Csv(csvText);

    const production = await loadProductionSnapshot(regionId);

    const memberResults = matchMembers(
        spreadsheet.members,
        production.members
    );

    return {
        spreadsheet,
        production,
        memberResults,
    };
}