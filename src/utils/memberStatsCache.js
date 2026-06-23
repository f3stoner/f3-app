import { state } from "../modules/state.js";

function getRegionMemberCacheKey(memberId, regionId = state.currentRegionId) {
    return `${regionId}__${memberId}`;
}

export function invalidateMemberStatsCache(memberIds = [], regionId = state.currentRegionId) {
    if (!state.memberDashboardStatsByMemberId) return;

    memberIds.forEach(memberId => {
        if (!memberId || !regionId) return;

        delete state.memberDashboardStatsByMemberId[
            getRegionMemberCacheKey(memberId, regionId)
        ];
    });
}

export function invalidateRecentMemberActivityCache(memberIds = [], regionId = state.currentRegionId) {
    if (!state.recentMemberActivityByMemberId) return;

    memberIds.forEach(memberId => {
        if (!memberId || !regionId) return;

        delete state.recentMemberActivityByMemberId[
            getRegionMemberCacheKey(memberId, regionId)
        ];
    });
}