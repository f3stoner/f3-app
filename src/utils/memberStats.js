export function getLastPostDate(member, sessions) {
    if (!member || !member.id) return null;

    let latest = null;

    sessions.forEach(session => {
        const wasThere = 
            session.attendeeIds?.includes(member.id) ||
            session.fngs?.some(fng => fng?.memberId === member.id);

        if (!wasThere) return;

        if (!latest || session.date > latest) {
            latest = session.date;
        }
    });

    return latest || member.firstPostDate || null;
}