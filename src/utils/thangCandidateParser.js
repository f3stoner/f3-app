const START_SECTION_REGEX =
    /^(?:Thang|Thing|Main Set|Main Event|The Thang|The Work)\s*(?:\d+)?\s*(?:[-:–—])?\s*(.*)$/i;

const STOP_SECTION_REGEX =
    /^(?:Q[- ]?Source|QSource|Emotional Safety|COR|Count[- ]?o[- ]?Rama|Count o Rama|NOR|Name[- ]?o[- ]?Rama|Name o Rama|Announcements|COT|Circle of Trust|Moleskin|NMM|Prayer)\b/i;

export function extractThangCandidatesFromSession(session) {
    const text = session.backblastText || "";
    if (!text.trim()) return [];

    const lines = text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(line => line.trimEnd());

    const candidates = [];
    let current = null;

    function closeCurrent() {
        if (!current) return;

        const content = current.lines.join("\n").trim();

        if (content.length >= 40) {
            candidates.push({
                sourceSessionId: session.id,
                sourceBackblastLinkId: session.sourceBackblastLinkId || null,
                sourceAoName: session.aoName || "",
                sourceDate: session.date || null,
                sourceQIds: session.qIds || (session.qId ? [session.qId] : []),
                title: current.title || "",
                content,
                suggestedEmphasis: null,
                couponRequirement: "unknown",
                terrain: [],
                accessories: [],
                status: "needs_review",
            });
        }

        current = null;
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();

        const startMatch = line.match(START_SECTION_REGEX);

        if (startMatch) {
            closeCurrent();

            current = {
                title: startMatch[1]?.trim() || line.trim(),
                lines: [line],
            };

            continue;
        }

        if (current && STOP_SECTION_REGEX.test(line)) {
            closeCurrent();
            continue;
        }

        if (current) {
            current.lines.push(rawLine);
        }
    }

    closeCurrent();

    return candidates;
}