import { state } from "../modules/state.js";
import { formatDate } from "./date.js";
import { getWorkoutEmphasisForSlot } from "./workoutEmphasis.js";

let html2canvasPromise = null;

function loadHtml2Canvas() {
    if (!html2canvasPromise) {
        html2canvasPromise = import(
            /* webpackChunkName: "vendor-html2canvas" */
            "html2canvas"
        )
            .then(module => module.default || module)
            .catch(error => {
                /*
                 * Allow a later retry if the chunk request fails.
                 */
                html2canvasPromise = null;
                throw error;
            });
    }

    return html2canvasPromise;
}

const EXPORT_WIDTH = 1600;
const EXPORT_HEIGHT = 980;

const EMPHASIS_EMOJI = {
    heavy: "🏋️",
    upper: "💪",
    lower: "🦵",
    cardio: "❤️",
    ruck: "🎒",
    core: "🆎",
    "30/30": "💡",
    stairs: "🗼",
    bootcamp: "🛡️",
    murph_training: "🏅",
    benchmark: "📋",
    other: "⭕",
};

const DAY_ACCENTS = [
    "#2f8cff",
    "#32c46c",
    "#f4b63f",
    "#ff394a",
    "#9b59ff",
    "#29c7b8",
];

const AO_COLOR_OVERRIDES = {
    "the cave": "#2f8cff",
    "the forest": "#32c46c",
    "the iron": "#c9ced6",
    "the keep": "#b56cff",
    "the mine": "#f3d33b",
    "the moat am": "#f06a2f",
    "the moat pm": "#f06a2f",
    "the rock": "#ff8a2f",
    "the watch": "#ff394a",
    "the watch (d)": "#ff394a",
    "the watch (w)": "#ff394a",
    "southie": "#29c7b8",
    "convergence": "#9b59ff",
    "convergence (cave)": "#9b59ff",
    "dads": "#50c878",
    "dads (the mine)": "#50c878",
};

function getMemberName(memberId) {
    const member = state.members.find(m => m.id === memberId);
    return member?.paxName || "Filled";
}

function getAo(slot) {
    return state.aos.find(ao => ao.id === slot.aoId) || null;
}

function getShortDayLabel(dateString) {
    const date = new Date(`${dateString}T12:00:00`);

    return date.toLocaleDateString(undefined, {
        weekday: "short",
    }).toUpperCase();
}

function getMonthDay(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return `${month}/${day}`;
}

function getWeekRangeLabel(weekStart, weekEnd) {
    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
}

function getEmphasisEmoji(emphasis) {
    if (!emphasis) return "";

    const key = String(emphasis.key || emphasis.type || emphasis.label || "")
        .trim()
        .toLowerCase();

    if (EMPHASIS_EMOJI[key]) return EMPHASIS_EMOJI[key];

    const label = String(emphasis.label || "").toLowerCase();

    if (label.includes("upper")) return EMPHASIS_EMOJI.upper;
    if (label.includes("lower")) return EMPHASIS_EMOJI.lower;
    if (label.includes("cardio")) return EMPHASIS_EMOJI.cardio;
    if (label.includes("ruck")) return EMPHASIS_EMOJI.ruck;
    if (label.includes("core") || label.includes("ab")) return EMPHASIS_EMOJI.core;
    if (label.includes("30")) return EMPHASIS_EMOJI["30/30"];
    if (label.includes("stair")) return EMPHASIS_EMOJI.stairs;
    if (label.includes("heavy")) return EMPHASIS_EMOJI.heavy;

    return EMPHASIS_EMOJI.other;
}

function getAoColor(aoName) {
    const normalizedAoName = String(aoName || "")
        .trim()
        .toLowerCase();

    if (AO_COLOR_OVERRIDES[normalizedAoName]) {
        return AO_COLOR_OVERRIDES[normalizedAoName];
    }

    const fallbackColors = [
        "#2f8cff",
        "#32c46c",
        "#f3d33b",
        "#ff8a2f",
        "#ff394a",
        "#b56cff",
        "#29c7b8",
        "#c9ced6",
    ];

    let hash = 0;

    for (let i = 0; i < normalizedAoName.length; i += 1) {
        hash = normalizedAoName.charCodeAt(i) + ((hash << 5) - hash);
    }

    return fallbackColors[Math.abs(hash) % fallbackColors.length];
}

function createSlotLine(slot, index) {
    const ao = getAo(slot);
    const emphasis = getWorkoutEmphasisForSlot(slot, ao);
    const emoji = getEmphasisEmoji(emphasis);
    const aoName = ao?.name || "Unknown AO";
    const qName = slot.qUserId ? getMemberName(slot.qUserId) : "<OPEN>";

    const row = document.createElement("div");
    row.classList.add("weekly-q-export-slot-line");

    const left = document.createElement("div");
    left.classList.add("weekly-q-export-slot-left");

    const aoLabel = document.createElement("span");
    aoLabel.classList.add("weekly-q-export-ao");
    aoLabel.style.color = getAoColor(aoName);
    aoLabel.textContent = aoName.toUpperCase();

    const qLabel = document.createElement("span");
    qLabel.classList.add(slot.qUserId ? "weekly-q-export-q" : "weekly-q-export-open");
    qLabel.textContent = qName.toUpperCase();

    left.append(aoLabel, qLabel);

    const icon = document.createElement("span");
    icon.classList.add("weekly-q-export-emphasis");
    icon.textContent = emoji;

    row.append(left, icon);

    return row;
}

function createDayColumn(date, dayIndex) {
    const dayColumn = document.createElement("div");
    dayColumn.classList.add("weekly-q-export-day-column");

    const header = document.createElement("div");
    header.classList.add("weekly-q-export-day-header");

    const dayName = document.createElement("div");
    dayName.classList.add("weekly-q-export-day-name");
    dayName.textContent = getShortDayLabel(date);

    const dayDate = document.createElement("div");
    dayDate.classList.add("weekly-q-export-day-date");
    dayDate.textContent = getMonthDay(date);

    const accent = document.createElement("div");
    accent.classList.add("weekly-q-export-day-accent");
    accent.style.background = DAY_ACCENTS[dayIndex % DAY_ACCENTS.length];

    header.append(dayName, dayDate, accent);

    const list = document.createElement("div");
    list.classList.add("weekly-q-export-slot-list");

    const daySlots = state.qSlots
        .filter(slot => slot.date === date)
        .sort((a, b) => {
            const aoA = getAo(a)?.name || "";
            const aoB = getAo(b)?.name || "";
            return aoA.localeCompare(aoB);
        });

    if (daySlots.length === 0) {
        const empty = document.createElement("div");
        empty.classList.add("weekly-q-export-empty");

        const sun = document.createElement("div");
        sun.classList.add("weekly-q-export-empty-icon");
        sun.textContent = "☀️";

        const text = document.createElement("div");
        text.textContent = "NO OFFICIAL Q";

        const subtext = document.createElement("div");
        subtext.classList.add("weekly-q-export-empty-subtext");
        subtext.textContent = "GET OUT. STAY READY.";

        empty.append(sun, text, subtext);
        list.appendChild(empty);
    } else {
        const visibleSlots = daySlots.slice(0, 7);

        visibleSlots.forEach((slot, index) => {
            list.appendChild(createSlotLine(slot, index));
        });

        if (daySlots.length > visibleSlots.length) {
            const more = document.createElement("div");
            more.classList.add("weekly-q-export-more");
            more.textContent = `+${daySlots.length - visibleSlots.length} more`;
            list.appendChild(more);
        }
    }

    dayColumn.append(header, list);
    return dayColumn;
}

function createScheduleExportCard({ weekStart, weekEnd, weekDates }) {
    const card = document.createElement("div");
    card.classList.add("weekly-q-export-card");

    const exportDates = weekDates.slice(0, 6);
    const exportEnd = exportDates[exportDates.length - 1] || weekEnd;

    const topBar = document.createElement("div");
    topBar.classList.add("weekly-q-export-topbar");
    
    const brand = document.createElement("div");
    brand.classList.add("weekly-q-export-brand");
    
    const logoText = document.createElement("div");
    logoText.classList.add("weekly-q-export-logo-text");
    logoText.textContent = state.regionName || "REGION";
    
    const regionText = document.createElement("div");
    regionText.classList.add("weekly-q-export-region");
    regionText.textContent = "WEEKLY Q SCHEDULE";
    
    brand.append(logoText, regionText);
    
    const meta = document.createElement("div");
    meta.classList.add("weekly-q-export-meta");
    
    const dateLine = document.createElement("div");
    dateLine.classList.add("weekly-q-export-date-line");
    dateLine.textContent = `WEEK OF ${formatDate(weekStart)} – ${formatDate(exportEnd)}`;
    
    const creed = document.createElement("div");
    creed.classList.add("weekly-q-export-creed");
    creed.textContent = "LEAD. SERVE. ENDURE.";
    
    meta.append(dateLine, creed);

    const key = document.createElement("div");
    key.classList.add("weekly-q-export-key");

    const keyTitle = document.createElement("div");
    keyTitle.classList.add("weekly-q-export-key-title");
    keyTitle.textContent = "KEY";

    const keyGrid = document.createElement("div");
    keyGrid.classList.add("weekly-q-export-key-grid");

    [
        ["🏋️", "Heavy"],
        ["💪", "Upper"],
        ["🦵", "Lower"],
        ["❤️", "Cardio"],
        ["🎒", "Ruck"],
        ["🆎", "Core"],
        ["💡", "30/30"],
        ["🗼", "Stairs"],
        ["🛡️", "Bootcamp"],
        ["🏅", "Murph Training"],
        ["📋", "Benchmark"],
        ["⭕", "Other"],
    ].forEach(([emoji, label]) => {
        const item = document.createElement("div");
        item.classList.add("weekly-q-export-key-item");
        item.textContent = `${emoji} ${label}`;
        keyGrid.appendChild(item);
    });

    key.append(keyTitle, keyGrid);
    topBar.append(brand, meta, key);

    const columns = document.createElement("div");
    columns.classList.add("weekly-q-export-columns");

    exportDates.forEach((date, index) => {
        columns.appendChild(createDayColumn(date, index));
    });

    const bottomBar = document.createElement("div");
    bottomBar.classList.add("weekly-q-export-bottom-bar");
    
    const footerLeft = document.createElement("div");
    footerLeft.classList.add("weekly-q-export-footer-left");
    
    const footerIcon = document.createElement("div");
    footerIcon.classList.add("weekly-q-export-footer-icon");
    footerIcon.textContent = "Q";
    
    const footerCopy = document.createElement("div");
    
    const footerTitle = document.createElement("div");
    footerTitle.classList.add("weekly-q-export-footer-title");
    footerTitle.textContent = "Generated by The Q";
    
    const footerText = document.createElement("div");
    footerText.classList.add("weekly-q-export-footer-text");
    footerText.textContent = "Claim. Plan. Lead. Log.";
    
    footerCopy.append(footerTitle, footerText);
    footerLeft.append(footerIcon, footerCopy);
    
    const reminders = document.createElement("div");
    reminders.classList.add("weekly-q-export-reminders");
    
    const reminderLabel = document.createElement("span");
    reminderLabel.classList.add("weekly-q-export-reminder-label");
    reminderLabel.textContent = "REMEMBER:";
    
    const reminderItems = document.createElement("span");
    reminderItems.classList.add("weekly-q-export-reminder-items");
    reminderItems.textContent = "⏰ SHOW UP EARLY  |  🎒 BRING A FRIEND  |  💧 HYDRATE";
    
    reminders.append(reminderLabel, reminderItems);
    
    bottomBar.append(footerLeft, reminders);
        
    const microFooter = document.createElement("div");
    microFooter.classList.add("weekly-q-export-micro-footer");
    microFooter.textContent = "LEAVE NO MAN BEHIND. LEAVE NO MAN WHERE YOU FOUND HIM";
    
    card.append(topBar, columns, bottomBar, microFooter);

    return card;
}

export async function shareWeeklyQScheduleImage({ weekStart, weekEnd, weekDates }) {

    const exportWrap = document.createElement("div");
    exportWrap.classList.add("weekly-q-export-wrap");

    const card = createScheduleExportCard({ weekStart, weekEnd, weekDates });
    exportWrap.appendChild(card);
    document.body.appendChild(exportWrap);

    try {
        const html2canvas = await loadHtml2Canvas();

        const canvas = await html2canvas(card, {
            backgroundColor: "#050505",
            scale: 2,
            width: EXPORT_WIDTH,
            height: EXPORT_HEIGHT,
        });

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, "image/png");
        });

        if (!blob) {
            throw new Error("Could not create schedule image.");
        }

        const file = new File([blob], "weekly-q-schedule.png", {
            type: "image/png",
        });

        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({
                title: "Weekly Q Schedule",
                files: [file],
            });
            return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "weekly-q-schedule.png";
        link.click();
        URL.revokeObjectURL(url);
    } finally {
        exportWrap.remove();
    }
}