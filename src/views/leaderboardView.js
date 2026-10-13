import { state } from "../modules/state.js";
import { loadRegionPaxLeaderboard } from "../services/cloudData.js";
import { createAppHeader } from "../components/appHeader.js";
import { createGlobalNav } from "../components/globalNav.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";

let metric = "posts";
let period = "month";
let selectedAoId = null;

let selectedMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
let selectedYear = new Date().getFullYear();

function getLeaderboardDates(period) {
    if (period === "month") {
        const [year, month] = selectedMonth.split("-").map(Number);
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
        return { start, end };
    }

    if (period === "year") return { start: `${selectedYear}-01-01`, end: `${selectedYear}-12-31` };
    return { start: null, end: null };
}

let requestSequence = 0;

const CACHE_TTL = 5 * 60 * 1000;
const leaderboardCache = new Map();
const leaderboardRequests = new Map();

const cacheGenerations = new Map();

function refreshLeaderboards(regionId) {
    cacheGenerations.set(regionId, (cacheGenerations.get(regionId) || 0) + 1);

    for (const key of leaderboardCache.keys()) {
        if (key.startsWith(`${regionId}:`)) leaderboardCache.delete(key);
    }

    for (const key of leaderboardRequests.keys()) {
        if (key.startsWith(`${regionId}:`)) leaderboardRequests.delete(key);
    }
}

function getLeaderboardKey(regionId, metric, period, aoId = null) {
    const { start, end } = getLeaderboardDates(period);
    return `${regionId}:${aoId || "all"}:${metric}:${period}:${start || "all"}:${end || "all"}`;
}

function getCachedLeaderboard(regionId, metric, period, aoId = null) {
    const key = getLeaderboardKey(regionId, metric, period, aoId);
    const cached = leaderboardCache.get(key);

    if (!cached || Date.now() - cached.loadedAt >= CACHE_TTL) return null;
    return cached.rows;
}

function fetchLeaderboard(regionId, metric, period, aoId = null) {
    const { start, end } = getLeaderboardDates(period);
    const key = getLeaderboardKey(regionId, metric, period, aoId);
    const cached = getCachedLeaderboard(regionId, metric, period, aoId);

    if (cached !== null) return Promise.resolve(cached);
    if (leaderboardRequests.has(key)) return leaderboardRequests.get(key);

    const generation = cacheGenerations.get(regionId) || 0;
    
    const request = loadRegionPaxLeaderboard(regionId, metric, period, aoId, start, end)
        .then(rows => {
            if ((cacheGenerations.get(regionId) || 0) === generation) {
                leaderboardCache.set(key, { rows, loadedAt: Date.now() });
            }
            return rows;
        })
        .finally(() => {
            if (leaderboardRequests.get(key) === request) leaderboardRequests.delete(key);
        });

    leaderboardRequests.set(key, request);
    return request;
}

function prefetchLeaderboards(regionId) {
    for (const metric of ["posts", "qs"]) {
        for (const period of ["month", "year", "all"]) {
            if (getCachedLeaderboard(regionId, metric, period) !== null) continue;
            fetchLeaderboard(regionId, metric, period).catch(() => {});
        }
    }
}

export function renderLeaderboardView() {
    const app = document.getElementById("app");
    app.classList.add("view-leaderboards");
    app.textContent = "";
    cleanupMainMenu();

    const header = createAppHeader({
        title: "",
        showBack: true,
        fallbackView: "dashboard",
        showMenu: true,
    });

    const title = document.createElement("h1");
    title.textContent = "Leaderboards";

    const subtitle = document.createElement("div");
    subtitle.classList.add("leaderboard-subtitle");

    const periodLabel = period === "month"
        ? new Date(`${selectedMonth}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : period === "year"
            ? String(selectedYear)
            : "All Time";

    const content = document.createElement("div");
    content.classList.add("section");

    if (!state.leaderboardsEnabled || !state.currentRegionId) {
        content.textContent = "Leaderboards are unavailable for this region.";
        app.append(header, title, content, createGlobalNav());
        return;
    }

    const regionAos = (state.aos || [])
        .filter(ao => ao.isActive !== false)
        .sort((a, b) => a.name.localeCompare(b.name));

    if (selectedAoId && !regionAos.some(ao => ao.id === selectedAoId)) selectedAoId = null;

    const selectedAo = regionAos.find(ao => ao.id === selectedAoId);

    subtitle.textContent = `${periodLabel} · ${selectedAo?.name || "Regional"} ${metric === "posts" ? "Posts" : "Qs"}`;

    const filters = document.createElement("div");
    filters.classList.add("leaderboard-filters");
    
    const metricFilters = document.createElement("div");
    metricFilters.classList.add("leaderboard-filter-group", "leaderboard-metric-filters");
    
    const periodFilters = document.createElement("div");
    periodFilters.classList.add("leaderboard-filter-group", "leaderboard-period-filters");
    
    function addFilter(group, label, value, current, update) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("leaderboard-filter-button");
        if (value === current) button.classList.add("active");
        button.textContent = label;
        button.setAttribute("aria-pressed", String(value === current));
        button.addEventListener("click", () => {
            if (value === current) return;
            update(value);
            renderLeaderboardView();
        });
        group.appendChild(button);
    }
    
    addFilter(metricFilters, "Posts", "posts", metric, value => metric = value);
    addFilter(metricFilters, "Qs", "qs", metric, value => metric = value);
    addFilter(periodFilters, "Month", "month", period, value => period = value);
    addFilter(periodFilters, "Year", "year", period, value => period = value);
    addFilter(periodFilters, "All Time", "all", period, value => period = value);

    const aoFilter = document.createElement("select");
    aoFilter.classList.add("leaderboard-ao-filter");
    aoFilter.setAttribute("aria-label", "Filter leaderboard by AO");

    const allAosOption = document.createElement("option");
    allAosOption.value = "";
    allAosOption.textContent = "All AOs";
    aoFilter.appendChild(allAosOption);

    regionAos.forEach(ao => {
        const option = document.createElement("option");
        option.value = ao.id;
        option.textContent = ao.name;
        aoFilter.appendChild(option);
    });

    aoFilter.value = selectedAoId || "";
    aoFilter.addEventListener("change", () => {
        selectedAoId = aoFilter.value || null;
        renderLeaderboardView();
    });

    const dateFilter = document.createElement("select");
    dateFilter.classList.add("leaderboard-date-filter");
    dateFilter.setAttribute("aria-label", period === "month" ? "Select month" : "Select year");

    const now = new Date();

    if (period === "month") {
        for (let i = 0; i < 60; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            const option = document.createElement("option");
            option.value = value;
            option.textContent = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
            dateFilter.appendChild(option);
        }

        dateFilter.value = selectedMonth;
    } else if (period === "year") {
        for (let year = now.getFullYear(); year >= now.getFullYear() - 9; year--) {
            const option = document.createElement("option");
            option.value = String(year);
            option.textContent = String(year);
            dateFilter.appendChild(option);
        }

        dateFilter.value = String(selectedYear);
    }

    dateFilter.addEventListener("change", () => {
        if (period === "month") selectedMonth = dateFilter.value;
        if (period === "year") selectedYear = Number(dateFilter.value);
        renderLeaderboardView();
    });
    
    filters.append(metricFilters, periodFilters, aoFilter);
    if (period !== "all") filters.appendChild(dateFilter);

    const tools = document.createElement("div");
    tools.classList.add("leaderboard-tools");

    const search = document.createElement("input");
    search.type = "search";
    search.classList.add("leaderboard-search");
    search.placeholder = "Search PAX...";
    search.setAttribute("aria-label", "Search PAX");

    const myRankButton = document.createElement("button");
    myRankButton.type = "button";
    myRankButton.classList.add("secondary-button");
    myRankButton.textContent = "My Rank";

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.classList.add("secondary-button");
    refreshButton.textContent = "Refresh";

    const shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.classList.add("secondary-button");
    shareButton.textContent = "Share Top 10";

    tools.append(search, myRankButton, refreshButton, shareButton);

    const results = document.createElement("div");
    results.classList.add("leaderboard-results");

    const cachedRows = getCachedLeaderboard(state.currentRegionId, metric, period, selectedAoId);
    results.textContent = cachedRows === null ? "Loading leaderboard..." : "";

    content.append(filters, tools, results);
    app.append(header, title, subtitle, content, createGlobalNav());

    if (state.isMainMenuOpen) {
        document.body.appendChild(createMainMenu());
    }

    const regionId = state.currentRegionId;
    const selectedMetric = metric;
    const selectedPeriod = period;
    const selectedAoScope = selectedAoId;
    const requestId = ++requestSequence;
    let currentRows = [];

    function displayRows(rows) {
        results.replaceChildren();

        const query = search.value.trim().toLowerCase();
        const visibleRows = rows.filter(row =>
            (row.pax_name || "").toLowerCase().includes(query)
        );

        if (!visibleRows.length) {
            results.textContent = query
                ? "No matching PAX."
                : "No recorded activity for this period.";
            return;
        }

        const table = document.createElement("table");
        table.classList.add("leaderboard-table");

        const thead = document.createElement("thead");
        const headings = document.createElement("tr");

        ["Rank", "PAX", selectedMetric === "posts" ? "Posts" : "Qs"].forEach(label => {
            const th = document.createElement("th");
            th.textContent = label;
            headings.appendChild(th);
        });

        thead.appendChild(headings);

        const tbody = document.createElement("tbody");

        visibleRows.forEach(row => {
            const tr = document.createElement("tr");

            if (row.member_id === state.currentUserMemberId) {
                tr.classList.add("leaderboard-current-pax");
            }

            [row.rank, row.pax_name, row.total].forEach(value => {
                const td = document.createElement("td");
                td.textContent = String(value ?? "");
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.append(thead, tbody);
        results.appendChild(table);
    }

    function loadRows(forceRefresh = false) {
        if (forceRefresh) refreshLeaderboards(regionId);

        const loadId = ++requestSequence;
        results.textContent = getCachedLeaderboard(regionId, selectedMetric, selectedPeriod, selectedAoScope) === null
            ? "Loading leaderboard..."
            : "";

        fetchLeaderboard(regionId, selectedMetric, selectedPeriod, selectedAoScope)
            .then(rows => {
                if (loadId !== requestSequence ||
                    state.currentView !== "leaderboards" ||
                    state.currentRegionId !== regionId ||
                    !state.leaderboardsEnabled ||
                    !results.isConnected) return;

                currentRows = rows;
                displayRows(rows);
                prefetchLeaderboards(regionId);
            })
            .catch(error => {
                console.error("Failed to load leaderboard:", error);
                if (loadId !== requestSequence || !results.isConnected) return;
                results.textContent = "Unable to load leaderboard.";
            });
    }

    search.addEventListener("input", () => displayRows(currentRows));

    myRankButton.addEventListener("click", () => {
        const mine = currentRows.find(row => row.member_id === state.currentUserMemberId);

        if (!mine) {
            window.alert("You have no recorded activity in this leaderboard period.");
            return;
        }

        search.value = "";
        displayRows(currentRows);

        const index = currentRows.findIndex(row => row.member_id === state.currentUserMemberId);
        const row = results.querySelectorAll("tbody tr")[index];

        if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            row.classList.add("leaderboard-rank-focus");
            setTimeout(() => row.classList.remove("leaderboard-rank-focus"), 1800);
        }
    });

    refreshButton.addEventListener("click", () => loadRows(true));

    shareButton.addEventListener("click", async () => {
        if (!currentRows.length) return;

        const regionName = state.regionName || "F3";
        const heading = `${regionName} · ${selectedAo?.name || "Regional"} · ${selectedMetric === "posts" ? "Posts" : "Qs"}`;
        const lines = currentRows.slice(0, 10).map(row =>
            `${row.rank}. ${row.pax_name} — ${row.total}`
        );

        const text = [heading, periodLabel, "", ...lines, "", "Powered by The Q"].join("\n");

        try {
            if (navigator.share) {
                await navigator.share({ text });
            } else {
                await navigator.clipboard.writeText(text);
                window.alert("Leaderboard copied to clipboard.");
            }
        } catch (error) {
            if (error.name !== "AbortError") {
                console.error("Unable to share leaderboard:", error);
                window.alert("Unable to share leaderboard.");
            }
        }
    });

    loadRows();
}