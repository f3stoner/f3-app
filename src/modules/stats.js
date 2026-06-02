import { state } from "./state.js";

export function getMemberStats(memberId) {
    const stats =
        state.memberStatsByMemberId?.[memberId] ||
        state.memberStats?.find(stat => stat.memberId === memberId);

    if (!stats) return getEmptyMemberStats();

    return {
        posts: stats.posts ?? 0,
        qs: stats.qs ?? 0,
        fngsEh: stats.fngsEh ?? 0,
        firstPostDate: stats.firstPostDate ?? null,
        lastPostDate: stats.lastPostDate ?? null,
        favoriteAo: stats.favoriteAo ?? null,
        lastQDate: stats.lastQDate ?? null,
    };
}

function getEmptyMemberStats() {
    return {
        posts: 0,
        qs: 0,
        fngsEh: 0,
        firstPostDate: null,
        lastPostDate: null,
        favoriteAo: null,
        lastQDate: null,
    };
}