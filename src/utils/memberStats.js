import { memberAttendedSession } from "./sessionAttendance.js";

export function getLastPostDate(member, sessions) {
    if (!member || !member.id) return null;

    let latest = null;

    sessions.forEach(session => {
        if (!memberAttendedSession(session, member.id)) return;

        if (!latest || session.date > latest) {
            latest = session.date;
        }
    });

    return latest || member.firstPostDate || null;
}