import { state } from "../modules/state.js";

export function invalidateMemberStatsCache(memberIds = []) {
    if (!state.memberDashboardStatsByMemberId) return;

    memberIds.forEach(memberId => {
        if (memberId) {
            delete state.memberDashboardStatsByMemberId[memberId];
        }
    });
}