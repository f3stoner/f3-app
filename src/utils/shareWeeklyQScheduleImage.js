import { state } from "../modules/state.js";
import { formatDate } from "./date.js";
import { getWorkoutEmphasisForSlot } from "./workoutEmphasis.js";

const WIDTH = 1600;
const HEIGHT = 900;

const COLORS = {
    bg: "#050505",
    panel: "#3f3f3f",
    panelDark: "#2f2f2f",
    border: "#d8d8d8",
    text: "#ffffff",
    muted: "#d7d7d7",
    open: "#39ff5a",
    taken: "#ffffff",
    accent: "#f5f5f2",
};

const EMPHASIS_EMOJI = {
    heavy: "🏋️",
    upper: "💪",
    lower: "🦵",
    cardio: "❤️",
    ruck: "🎒",
    core: "🆎",
    "30/30": "💡",
    stairs: "🗼",
    other: "⭕",
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
        month: "numeric",
        day: "numeric",
    }).toUpperCase();
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawText(ctx, text, x, y, options = {}) {
    ctx.fillStyle = options.color || COLORS.text;
    ctx.font = options.font || "32px Arial";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "top";
    ctx.fillText(text, x, y);
}

function getDaySlots(date) {
    return state.qSlots
        .filter(slot => slot.date === date)
        .sort((a, b) => {
            const aoA = getAo(a)?.name || "";
            const aoB = getAo(b)?.name || "";

            return aoA.localeCompare(aoB);
        });
}

function getEmphasisEmoji(emphasis) {
    if (!emphasis) return "";

    const label = String(emphasis.label || "").toLowerCase();
    const icon = String(emphasis.icon || "").toLowerCase();

    return (
        EMPHASIS_EMOJI[icon] ||
        EMPHASIS_EMOJI[label] ||
        "⭕"
    );
}

function drawScheduleImage({ weekStart, weekEnd, weekDates }) {
    const canvas = document.createElement("canvas");

    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawText(ctx, "THE Q", 70, 52, {
        font: "900 54px Arial",
    });

    drawText(
        ctx,
        `${state.regionName || "REGION"} · WEEKLY Q SCHEDULE`,
        245,
        65,
        {
            font: "900 42px Arial",
        }
    );

    drawText(
        ctx,
        `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        245,
        115,
        {
            font: "600 24px Arial",
            color: COLORS.muted,
        }
    );

    const cardGap = 22;
    const cardW = 465;
    const cardH = 210;

    const startX = 55;
    const startY = 170;

    weekDates.slice(0, 6).forEach((date, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);

        const x = startX + col * (cardW + cardGap);
        const y = startY + row * (cardH + cardGap);

        ctx.fillStyle = COLORS.panel;
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 2;

        drawRoundedRect(ctx, x, y, cardW, cardH, 24);

        drawText(ctx, getShortDayLabel(date), x + cardW / 2, y + 20, {
            font: "900 35px Arial",
            align: "center",
        });

        const slots = getDaySlots(date);

        if (slots.length === 0) {
            drawText(ctx, "NO SLOTS", x + 30, y + 82, {
                font: "700 26px Arial",
                color: COLORS.muted,
            });

            return;
        }

        slots.slice(0, 5).forEach((slot, slotIndex) => {
            const ao = getAo(slot);

            const emphasis = getWorkoutEmphasisForSlot(slot, ao);

            const emoji = getEmphasisEmoji(emphasis);

            const lineY = y + 72 + slotIndex * 25;

            const qName = slot.qUserId
                ? getMemberName(slot.qUserId).toUpperCase()
                : "<OPEN>";

            const qColor = slot.qUserId
                ? COLORS.taken
                : COLORS.open;

            drawText(
                ctx,
                `${ao?.name || "UNKNOWN"}:`,
                x + 30,
                lineY,
                {
                    font: "900 22px Arial",
                    color: COLORS.accent,
                }
            );

            drawText(
                ctx,
                qName,
                x + 195,
                lineY,
                {
                    font: "800 22px Arial",
                    color: qColor,
                }
            );

            if (emoji) {
                drawText(
                    ctx,
                    emoji,
                    x + 395,
                    lineY - 2,
                    {
                        font: "22px Arial",
                    }
                );
            }
        });

        if (slots.length > 5) {
            drawText(
                ctx,
                `+${slots.length - 5} more`,
                x + 30,
                y + 190,
                {
                    font: "700 18px Arial",
                    color: COLORS.muted,
                }
            );
        }
    });

    const footerY = 655;

    ctx.fillStyle = COLORS.panelDark;
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;

    drawRoundedRect(ctx, 55, footerY, 1010, 150, 22);

    drawText(ctx, "Generated by The Q", 85, footerY + 30, {
        font: "900 34px Arial",
    });

    drawText(ctx, "Claim. Plan. Lead. Log.", 85, footerY + 78, {
        font: "700 26px Arial",
        color: COLORS.muted,
    });

    ctx.fillStyle = COLORS.panel;

    drawRoundedRect(ctx, 1100, footerY, 445, 150, 22);

    drawText(ctx, "KEY", 1130, footerY + 25, {
        font: "900 28px Arial",
    });

    drawText(
        ctx,
        "💪 UPPER  |  🦵 LOWER  |  ❤️ CARDIO",
        1130,
        footerY + 62,
        {
            font: "700 20px Arial",
        }
    );

    drawText(
        ctx,
        "🎒 RUCK  |  🆎 CORE  |  ⭕ OTHER",
        1130,
        footerY + 95,
        {
            font: "700 20px Arial",
        }
    );

    return canvas;
}

export async function shareWeeklyQScheduleImage({
    weekStart,
    weekEnd,
    weekDates,
}) {
    const canvas = drawScheduleImage({
        weekStart,
        weekEnd,
        weekDates,
    });

    const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, "image/png");
    });

    if (!blob) {
        throw new Error("Could not create schedule image.");
    }

    const file = new File(
        [blob],
        "weekly-q-schedule.png",
        {
            type: "image/png",
        }
    );

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
}


/*import html2canvas from "html2canvas";
import { state } from "../modules/state.js";
import { formatDate } from "./date.js";
import { getWorkoutEmphasisForSlot } from "./workoutEmphasis.js";
import { createIcon, createWeatherIcon } from "./icons.js";

function getMemberName(memberId) {
    const member = state.members.find(m => m.id === memberId);
    return member?.paxName || "Filled";
}

function getAo(slot) {
    return state.aos.find(ao => ao.id === slot.aoId) || null;
}

function getWeatherTargetDateTime(date, ao) {
    if (!date || !ao?.time) {
        return null;
    }

    return `${date}T${ao.time}:00-05:00`;
}

function getWeatherForExport(date, ao) {
    const targetDateTime = getWeatherTargetDateTime(date, ao);

    if (!ao?.id || !targetDateTime) {
        return null;
    }

    const cacheKey = `${ao.id}__${targetDateTime}`;
    const weather = state.weatherByAoDate?.[cacheKey];

    if (!weather || weather.isLoading || weather.weatherUnavailable) {
        return null;
    }

    return weather;
}

function createScheduleExportCard({ weekStart, weekEnd, weekDates }) {
    const card = document.createElement("div");
    card.classList.add("weekly-q-export-card");

    const title = document.createElement("div");
    title.classList.add("weekly-q-export-title");
    title.textContent = state.regionName || "F3";

    const subtitle = document.createElement("div");
    subtitle.classList.add("weekly-q-export-subtitle");
    subtitle.textContent = `Weekly Q Schedule · ${formatDate(weekStart)} - ${formatDate(weekEnd)}`;

    card.append(title, subtitle);

    weekDates.forEach(date => {
        const daySlots = state.qSlots
            .filter(slot => slot.date === date)
            .sort((a, b) => {
                const aoA = getAo(a)?.name || "";
                const aoB = getAo(b)?.name || "";
                return aoA.localeCompare(aoB);
            });

        const dayBlock = document.createElement("div");
        dayBlock.classList.add("weekly-q-export-day");
        const dayTitle = document.createElement("div");
        dayTitle.classList.add("weekly-q-export-day-title");
        dayTitle.textContent = formatDate(date);
        dayBlock.appendChild(dayTitle);

        if (daySlots.length === 0) {
            const empty = document.createElement("div");
            empty.classList.add("weekly-q-export-slot", "empty");
            empty.textContent = "No scheduled Q slots";
            dayBlock.appendChild(empty);

        } else {
            daySlots.forEach(slot => {
                const ao = getAo(slot);
                const emphasis = getWorkoutEmphasisForSlot(slot, ao);

                const weather = getWeatherForExport(slot.date, ao);

                const row = document.createElement("div");
                row.classList.add("weekly-q-export-slot");

                const left = document.createElement("div");
                left.classList.add("weekly-q-export-slot-left");
                
                const topRow = document.createElement("div");
                topRow.classList.add("weekly-q-export-slot-top-row");
                
                const aoName = document.createElement("div");
                aoName.classList.add("weekly-q-export-ao-name");
                aoName.textContent = ao?.name || "Unknown AO";
                
                topRow.appendChild(aoName);
                
                if (emphasis) {
                    const badge = document.createElement("div");
                    badge.classList.add("weekly-q-export-emphasis-badge");

                    const icon = createIcon(emphasis.icon);
                    icon.classList.add("weekly-q-export-emphasis-icon");

                    const label = document.createElement("span");
                    label.textContent = emphasis.label;

                    badge.append(icon, label);
                    topRow.appendChild(badge);
                }
                
                const timeRow = document.createElement("div");
                timeRow.classList.add("weekly-q-export-slot-time");
                timeRow.textContent = ao?.time || "";

                const metaWrap = document.createElement("div");
                metaWrap.classList.add("weekly-q-export-meta-wrap");
                metaWrap.appendChild(timeRow);

                if (weather) {
                    const weatherRow = document.createElement("div");
                    weatherRow.classList.add("weekly-q-export-weather");

                    const icon = createWeatherIcon(weather.icon, {
                        size: 11,
                        className: "weekly-q-export-weather-icon",
                    });

                    const text = document.createElement("span");
                    text.textContent = `${weather.temp}° · ${weather.precipChance}%`;

                    weatherRow.append(icon, text);
                    metaWrap.appendChild(weatherRow);
                }

                left.append(topRow, metaWrap);                
                
                const right = document.createElement("div");
                right.classList.add(slot.qUserId ? "filled" : "open");
                right.textContent = slot.qUserId ? getMemberName(slot.qUserId) : "OPEN";
                row.append(left, right);
                dayBlock.appendChild(row);
            });
        }
        card.appendChild(dayBlock);
    });
    
    const footer = document.createElement("div");
    footer.classList.add("weekly-q-export-footer");
    footer.textContent = "Generated by The Q";
    card.append(footer);

    return card;
}

export async function shareWeeklyQScheduleImage({ weekStart, weekEnd, weekDates }) {
    const exportWrap = document.createElement("div");
    exportWrap.classList.add("weekly-q-export-wrap");

    const card = createScheduleExportCard({ weekStart, weekEnd, weekDates });

    exportWrap.appendChild(card);

    document.body.appendChild(exportWrap);

    try {
        const canvas = await html2canvas(card, {
            backgroundColor: null,
            scale: 2,
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
}*/