import html2canvas from "html2canvas";
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
}