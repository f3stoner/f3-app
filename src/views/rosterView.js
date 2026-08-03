import { renderApp } from "../index.js";
import { state } from "../modules/state.js";
import { getMemberStats } from "../modules/stats.js";
import { formatDate } from "../utils/date.js";
import { createGlobalNav } from "../components/globalNav.js";
import { getMemberDisplayName } from "../utils/memberDisplay.js";
import { cleanupMainMenu, createMainMenu } from "../components/mainMenu.js";
import { createAppHeader } from "../components/appHeader.js";
import { insertMember } from "../services/cloudData.js";
import { showToast } from "../utils/toast.js";
import { PERMISSIONS, hasPermission } from "../utils/permissions.js";
import { navigateTo, navigateToPaxProfile } from "../utils/navigation.js";
import { addMember } from "../services/appData.js";

const ROSTER_INDEX_KEYS = [
  "#",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

let cleanupRosterInteractions = null;

function getRosterGroupKey(displayName) {
  const firstCharacter = displayName
    .trim()
    .charAt(0)
    .toUpperCase();

  return /^[A-Z]$/.test(firstCharacter)
    ? firstCharacter
    : "#";
}

function getRosterGroupId(groupKey) {
  return groupKey === "#"
    ? "roster-group-number"
    : `roster-group-${groupKey.toLowerCase()}`;
}

function formatRosterLastPost(dateValue) {
  if (!dateValue) {
    return "No posts";
  }

  const normalizedDate =
    typeof dateValue === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? `${dateValue}T00:00:00`
      : dateValue;

  const date = new Date(normalizedDate);

  if (Number.isNaN(date.getTime())) {
    return formatDate(dateValue);
  }

  const currentYear = new Date().getFullYear();
  const includesYear =
    date.getFullYear() !== currentYear;

  return new Intl.DateTimeFormat(
    undefined,
    {
      month: "short",
      day: "numeric",
      ...(includesYear
        ? { year: "numeric" }
        : {}),
    }
  ).format(date);
}

function renderRosterIndex(
  indexContainer,
  availableGroups
) {
  indexContainer.textContent = "";

  ROSTER_INDEX_KEYS.forEach((groupKey) => {
    const button =
      document.createElement("button");

    button.type = "button";

    button.classList.add(
      "roster-index-button"
    );

    button.dataset.groupKey = groupKey;
    button.textContent = groupKey;

    const isAvailable =
      availableGroups.has(groupKey);

    if (!isAvailable) {
      button.classList.add(
        "roster-index-button-unavailable"
      );

      button.disabled = true;
    }

    button.setAttribute(
      "aria-label",
      isAvailable
        ? `Jump to ${groupKey}`
        : `No PAX under ${groupKey}`
    );

    indexContainer.appendChild(button);
  });
}

function setupRosterDirectoryInteractions({
  rosterContainer,
  indexContainer,
}) {
  const prefersReducedMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  let isScrubbing = false;
  let scrubPointerId = null;
  let lastScrubbedKey = null;
  let didDrag = false;
  let suppressNextClick = false;
  let scrollFrame = null;

  function getGroups() {
    return [
      ...rosterContainer.querySelectorAll(
        ".roster-letter-group"
      ),
    ];
  }

  function getIndexButtons() {
    return [
      ...indexContainer.querySelectorAll(
        ".roster-index-button"
      ),
    ];
  }

  function setActiveIndexLetter(groupKey) {
    getIndexButtons().forEach((button) => {
      const isActive =
        button.dataset.groupKey === groupKey;

      button.classList.toggle(
        "roster-index-button-active",
        isActive
      );

      if (isActive) {
        button.setAttribute(
          "aria-current",
          "true"
        );
      } else {
        button.removeAttribute(
          "aria-current"
        );
      }
    });
  }

  function highlightRosterGroup(target) {
    target.classList.remove(
      "roster-letter-group-highlight"
    );

    requestAnimationFrame(() => {
      target.classList.add(
        "roster-letter-group-highlight"
      );
    });

    window.setTimeout(() => {
      target.classList.remove(
        "roster-letter-group-highlight"
      );
    }, 900);
  }

  function scrollToRosterGroup(
    groupKey,
    {
      behavior = "smooth",
      highlight = true,
    } = {}
  ) {
    const target = document.getElementById(
      getRosterGroupId(groupKey)
    );

    if (!target) return;

    setActiveIndexLetter(groupKey);

    target.scrollIntoView({
      behavior:
        prefersReducedMotion
          ? "auto"
          : behavior,
      block: "start",
    });

    requestScrollSync();

    if (highlight) {
      highlightRosterGroup(target);
    }
  }

  function getNearestAvailableButton(clientY) {
    const availableButtons =
      getIndexButtons().filter(
        button => !button.disabled
      );

    if (availableButtons.length === 0) {
      return null;
    }

    let nearestButton = null;
    let nearestDistance = Infinity;

    availableButtons.forEach((button) => {
      const rect =
        button.getBoundingClientRect();

      const centerY =
        rect.top + rect.height / 2;

      const distance =
        Math.abs(clientY - centerY);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestButton = button;
      }
    });

    return nearestButton;
  }

  function scrubToClientY(clientY) {
    const button =
      getNearestAvailableButton(clientY);

    if (!button) return;

    const groupKey =
      button.dataset.groupKey;

    if (
      !groupKey ||
      groupKey === lastScrubbedKey
    ) {
      return;
    }

    lastScrubbedKey = groupKey;

    scrollToRosterGroup(
      groupKey,
      {
        behavior: "auto",
        highlight: false,
      }
    );
  }

  function syncActiveLetterToScroll() {
    scrollFrame = null;

    if (isScrubbing) return;

    const groups = getGroups();

    if (groups.length === 0) return;

    /*
     * The sticky letter header sits beneath the application
     * header at roughly this viewport position.
     */
    const activeThreshold =
      100 +
      (
        parseFloat(
          getComputedStyle(
            document.documentElement
          ).getPropertyValue(
            "--safe-area-inset-top"
          )
        ) || 0
      );

    let activeGroup = groups[0];

    groups.forEach((group) => {
      const rect =
        group.getBoundingClientRect();

      if (rect.top <= activeThreshold) {
        activeGroup = group;
      }
    });

    const groupKey =
      activeGroup.dataset.groupKey;

    if (groupKey) {
      setActiveIndexLetter(groupKey);
    }
  }

  function requestScrollSync() {
    if (scrollFrame !== null) return;

    scrollFrame = requestAnimationFrame(
      syncActiveLetterToScroll
    );
  }

  function handleIndexClick(event) {
    const button = event.target.closest(
      ".roster-index-button"
    );

    if (!button || button.disabled) return;

    if (suppressNextClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
      return;
    }

    scrollToRosterGroup(
      button.dataset.groupKey,
      {
        behavior: "smooth",
        highlight: true,
      }
    );
  }

  function handlePointerDown(event) {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    indexContainer.classList.add(
      "roster-index-scrubbing"
    );

    isScrubbing = true;
    didDrag = false;
    lastScrubbedKey = null;
    scrubPointerId = event.pointerId;

    indexContainer.setPointerCapture(
      event.pointerId
    );

    scrubToClientY(event.clientY);
  }

  function handlePointerMove(event) {
    if (
      !isScrubbing ||
      event.pointerId !== scrubPointerId
    ) {
      return;
    }

    event.preventDefault();

    document.body.classList.add(
      "roster-scrubbing"
  );

    didDrag = true;

    scrubToClientY(event.clientY);
  }

  function finishScrubbing(event) {
    if (
      !isScrubbing ||
      event.pointerId !== scrubPointerId
    ) {
      return;
    }

    indexContainer.classList.remove(
      "roster-index-scrubbing"
    );

    document.body.classList.remove(
      "roster-scrubbing"
  );

    if (
      indexContainer.hasPointerCapture(
        event.pointerId
      )
    ) {
      indexContainer.releasePointerCapture(
        event.pointerId
      );
    }

    isScrubbing = false;
    scrubPointerId = null;
    lastScrubbedKey = null;

    if (didDrag) {
      /*
       * Pointer release may produce a click. Suppress that
       * click so it does not initiate a second smooth scroll.
       */
      suppressNextClick = true;

      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    requestScrollSync();
  }

  indexContainer.addEventListener(
    "click",
    handleIndexClick
  );

  indexContainer.addEventListener(
    "pointerdown",
    handlePointerDown
  );

  indexContainer.addEventListener(
    "pointermove",
    handlePointerMove
  );

  indexContainer.addEventListener(
    "pointerup",
    finishScrubbing
  );

  indexContainer.addEventListener(
    "pointercancel",
    finishScrubbing
  );

  window.addEventListener(
    "scroll",
    requestScrollSync,
    {
      passive: true,
    }
  );

  window.addEventListener(
    "resize",
    requestScrollSync
  );

  requestScrollSync();

  return () => {
    indexContainer.removeEventListener(
      "click",
      handleIndexClick
    );

    indexContainer.removeEventListener(
      "pointerdown",
      handlePointerDown
    );

    indexContainer.removeEventListener(
      "pointermove",
      handlePointerMove
    );

    indexContainer.removeEventListener(
      "pointerup",
      finishScrubbing
    );

    indexContainer.removeEventListener(
      "pointercancel",
      finishScrubbing
    );

    window.removeEventListener(
      "scroll",
      requestScrollSync
    );

    window.removeEventListener(
      "resize",
      requestScrollSync
    );

    indexContainer.classList.remove(
      "roster-index-scrubbing"
    );
    
    document.body.classList.remove(
      "roster-scrubbing"
    );
    
    if (scrollFrame !== null) {
      cancelAnimationFrame(scrollFrame);
    }
  };
}

function updateRosterResultsMeta(
  resultsMeta,
  visibleCount
) {
  const totalCount = state.members.length;
  const hasSearch =
    Boolean(
      (state.rosterSearchTerm || "").trim()
    );

  if (state.rosterFilter || hasSearch) {
    resultsMeta.textContent =
      `${visibleCount} matching ` +
      `${visibleCount === 1 ? "PAX" : "PAX"}`;

    return;
  }

  resultsMeta.textContent =
    `${totalCount} PAX`;
}

function renderRosterList(
  rosterContainer,
  members,
  indexContainer,
  resultsMeta
) {
  rosterContainer.textContent = "";

  updateRosterResultsMeta(
    resultsMeta,
    members.length
  );

  if (members.length === 0) {
    const emptyState =
      document.createElement("div");

    emptyState.classList.add(
      "roster-empty-state"
    );

    emptyState.textContent =
      "No matching PAX found";

    rosterContainer.appendChild(emptyState);

    renderRosterIndex(
      indexContainer,
      new Set()
    );

    return;
  }

  const membersByGroup = new Map();

  members.forEach((member) => {
    const displayName =
      getMemberDisplayName(member);

    const groupKey =
      getRosterGroupKey(displayName);

    if (!membersByGroup.has(groupKey)) {
      membersByGroup.set(groupKey, []);
    }

    membersByGroup
      .get(groupKey)
      .push(member);
  });

  const availableGroups =
    new Set(membersByGroup.keys());

  ROSTER_INDEX_KEYS.forEach((groupKey) => {
    const groupMembers =
      membersByGroup.get(groupKey);

    if (!groupMembers?.length) return;

    const group =
      document.createElement("section");

    group.classList.add(
      "roster-letter-group"
    );

    group.id =
        getRosterGroupId(groupKey);

    group.dataset.groupKey = groupKey;

    const letterHeader =
      document.createElement("div");

    letterHeader.classList.add(
      "roster-letter-header"
    );

    letterHeader.textContent = groupKey;

    const groupList =
      document.createElement("div");

    groupList.classList.add(
      "roster-letter-list"
    );

    groupMembers.forEach((member) => {
      const displayName =
        getMemberDisplayName(member);

      const memberRow =
        document.createElement("button");

      memberRow.type = "button";

      memberRow.classList.add(
        "roster-member-row"
      );

      if (member.status === "inactive") {
        memberRow.classList.add(
          "roster-member-row-inactive"
        );
      }

      const memberContent =
        document.createElement("div");

      memberContent.classList.add(
        "roster-member-content"
      );

      const identityRow =
        document.createElement("div");

      identityRow.classList.add(
        "roster-member-identity"
      );

      const paxName =
        document.createElement("div");

      paxName.classList.add(
        "roster-member-name"
      );

      paxName.textContent = displayName;

      identityRow.appendChild(paxName);

      if (member.status === "inactive") {
        const statusBadge =
          document.createElement("span");

        statusBadge.classList.add(
          "roster-member-status"
        );

        statusBadge.textContent =
          "Inactive";

        identityRow.appendChild(
          statusBadge
        );
      }

      const memberStats =
        getMemberStats(member.id);

      const lastPost =
        formatRosterLastPost(
          memberStats.lastPostDate
        );

      const statsLine =
        document.createElement("div");

      statsLine.classList.add(
        "roster-member-stats"
      );

      statsLine.textContent =
        `${memberStats.posts} posts · ` +
        `${memberStats.qs} Qs · ` +
        `Last ${lastPost}`;

      memberContent.append(
        identityRow,
        statsLine
      );

      const chevron =
        document.createElement("span");

      chevron.classList.add(
        "roster-member-chevron"
      );

      chevron.setAttribute(
        "aria-hidden",
        "true"
      );

      chevron.textContent = "›";

      memberRow.append(
        memberContent,
        chevron
      );

      memberRow.addEventListener(
        "click",
        () => {
          navigateToPaxProfile(
            member.id
          );
        }
      );

      groupList.appendChild(memberRow);
    });

    group.append(
      letterHeader,
      groupList
    );

    rosterContainer.appendChild(group);
  });

  renderRosterIndex(
    indexContainer,
    availableGroups
  );
}

function memberMatchesRosterFilter(member) {
  if (!state.rosterFilter) return true;

  if (state.rosterFilter.type === "active-pax") {
    return state.sessions.some(session => {
      const isInRange =
        session.date >= state.rosterFilter.startDate &&
        session.date <= state.rosterFilter.endDate;

        const attended =
          Array.isArray(session.attendeeIds) &&
          session.attendeeIds.includes(member.id);

        return isInRange && attended;
    });
  }

  if (state.rosterFilter.type === "active-qs") {
    return state.sessions.some(session => {
      const isInRange =
        session.date >= state.rosterFilter.startDate &&
        session.date <= state.rosterFilter.endDate;

      const qIds = Array.isArray(session.qIds)
       ? session.qIds
       : session.qId
        ? [session.qId]
        : [];

      return isInRange && qIds.includes(member.id);
    });
  }

  if (state.rosterFilter.type === "posting-frequency") {
    const posts = state.sessions.filter(session => {
      const isInRange =
          session.date >= state.rosterFilter.startDate &&
          session.date <= state.rosterFilter.endDate;
      const attended =
          Array.isArray(session.attendeeIds) &&
          session.attendeeIds.includes(member.id);
      return isInRange && attended;
  }).length;

    switch (state.rosterFilter.bucket) {
      case "1":
      case "one":
      case "1 Post":
        return posts === 1;
      case "2-4":
      case "2-4 Posts":
        return posts >= 2 && posts <= 4;
      case "5-9":
      case "5-9 Posts":
        return posts >= 5 && posts <= 9;
      case "10-19":
      case "10-19 Posts":
        return posts >= 10 && posts <= 19;
      case "20+":
      case "20+ Posts":
      case "20-plus":
        return posts >= 20;
      default:
        return true;
    }
  }

  if (state.rosterFilter.type === "region-fng-pipeline") {
    const memberIds = new Set(
        state.rosterFilter.memberIds || []
    );

    return memberIds.has(member.id);
}

  if (state.rosterFilter.type === "pax-acceleration") {
    const memberIds = new Set(
        state.rosterFilter.memberIds || []
    );

    return memberIds.has(member.id);
  }

  if (state.rosterFilter.type === "check-the-six") {
    const memberIds = new Set(
        state.rosterFilter.memberIds || []
    );

    return memberIds.has(member.id);
  }

  if (state.rosterFilter.type === "ready-to-vq") {
    const memberIds = new Set(
        state.rosterFilter.memberIds || []
    );

    return memberIds.has(member.id);
}

if (state.rosterFilter.type === "ready-to-q-again") {
  const memberIds = new Set(
      state.rosterFilter.memberIds || []
  );

  return memberIds.has(member.id);
}

  return true;
}

function getVisibleRosterMembers() {
  const searchTerm = (state.rosterSearchTerm || "").trim().toLowerCase();

  const filteredMembers = state.members.filter((member) => {
    if (!memberMatchesRosterFilter(member)) return false;

    if (!searchTerm) return true;

    const displayName = getMemberDisplayName(member).toLowerCase();
    const realName = (member.realName || "").toLowerCase();
    const homeAo = (member.homeAo || "").toLowerCase();

    return (
      displayName.includes(searchTerm) ||
      realName.includes(searchTerm) ||
      homeAo.includes(searchTerm)
    );
  });

  return [...filteredMembers].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
    }

    const aName = getMemberDisplayName(a).toLowerCase();
    const bName = getMemberDisplayName(b).toLowerCase();

    return aName.localeCompare(bName);
  });
}

export function renderRoster() {
  cleanupRosterInteractions?.();
  cleanupRosterInteractions = null;

  const app =
    document.getElementById("app");

  app.textContent = "";
  app.className = "view-roster";

  cleanupMainMenu();

  const header = createAppHeader({
    title: "",
    showBack: true,
    fallbackView:
        state.rosterFilter?.sourceView ||
        "dashboard",
    showMenu: true,
});

  const title = document.createElement("h1");
  title.textContent = "Roster";

  const titleRow = document.createElement("div");
  titleRow.classList.add("roster-title-row");

  const addPaxButton = document.createElement("button");
  addPaxButton.classList.add("roster-add-button");
  addPaxButton.textContent = "Add PAX";

  addPaxButton.addEventListener("click", () => {
    openAddPaxModal();
  });

  titleRow.appendChild(title);

  if (hasPermission(PERMISSIONS.MANAGE_MEMBERS)) {
    titleRow.appendChild(addPaxButton);
  }

  const searchInput =
    document.createElement("input");

  searchInput.type = "search";
  searchInput.placeholder =
    "Search by PAX, name, or AO";

  searchInput.value =
    state.rosterSearchTerm || "";

  searchInput.classList.add(
    "roster-search"
  );

  searchInput.setAttribute(
    "aria-label",
    "Search roster"
  );

  const resultsMeta =
    document.createElement("div");

  resultsMeta.classList.add(
    "roster-results-meta"
  );

  const rosterDirectory =
    document.createElement("div");

  rosterDirectory.classList.add(
    "roster-directory"
  );

  const rosterContainer =
    document.createElement("div");

  rosterContainer.classList.add(
    "roster-list"
  );

  const rosterIndex =
    document.createElement("nav");

  rosterIndex.classList.add(
    "roster-index"
  );

  rosterIndex.setAttribute(
    "aria-label",
    "Roster alphabet navigation"
  );

  rosterDirectory.append(
    rosterContainer,
    rosterIndex
  );

  function renderVisibleRoster() {
    cleanupRosterInteractions?.();
  
    renderRosterList(
      rosterContainer,
      getVisibleRosterMembers(),
      rosterIndex,
      resultsMeta
    );
  
    cleanupRosterInteractions =
      setupRosterDirectoryInteractions({
        rosterContainer,
        indexContainer: rosterIndex,
      });
  }

  searchInput.addEventListener(
    "input",
    (event) => {
      state.rosterSearchTerm =
        event.target.value;

      renderVisibleRoster();
    }
  );

  renderVisibleRoster();

  const nav = createGlobalNav();

  let activeFilterNotice = null;

  if (state.rosterFilter) {
    activeFilterNotice = document.createElement("div");
    activeFilterNotice.classList.add("roster-filter-notice");

    const filterText = document.createElement("div");
    filterText.classList.add("roster-filter-copy");

    if (state.rosterFilter.type === "region-fng-pipeline") {
      filterText.textContent =
          `Showing ${state.rosterFilter.label} from the New PAX Pipeline`;
  
  } else if (state.rosterFilter.type === "pax-acceleration") {
      filterText.textContent =
          `Showing ${state.rosterFilter.label} from PAX Acceleration`;
  
  } else if (state.rosterFilter.type === "check-the-six") {
      filterText.textContent =
          `Showing ${state.rosterFilter.label} from Check the Six`;
  
  } else if (state.rosterFilter.type === "posting-frequency") {
      filterText.textContent =
          `Showing PAX in posting bucket: ${
              state.rosterFilter.label ||
              state.rosterFilter.bucket
          }`;
  } else if (state.rosterFilter.type === "ready-to-vq") {
    filterText.textContent =
        `Showing ${state.rosterFilter.label} from Ready to VQ`;
  } else if (
    state.rosterFilter.type === "ready-to-q-again"
) {
    filterText.textContent =
        `Showing ${state.rosterFilter.label} from Ready to Q Again`;}
    else {
    filterText.textContent =
        state.rosterFilter.label;
  }

    const clearButton = document.createElement("button");
    clearButton.classList.add("roster-filter-clear");
    clearButton.textContent = "Clear Filter";

    clearButton.addEventListener("click", () => {
      state.rosterFilter = null;
      renderRoster();
    });

    activeFilterNotice.append(filterText, clearButton);
  }

  if (activeFilterNotice) {
    app.append(
      header,
      titleRow,
      activeFilterNotice,
      searchInput,
      resultsMeta,
      rosterDirectory,
      nav
  );
  } else {
    app.append(
      header,
      titleRow,
      searchInput,
      resultsMeta,
      rosterDirectory,
      nav
  );
  }
  if (state.isMainMenuOpen) {
    document.body.appendChild(createMainMenu());
  }
}

function openAddPaxModal() {
  const overlay = document.createElement("div");
  overlay.classList.add("modal-overlay");

  const modal = document.createElement("div");
  modal.classList.add("modal");
  modal.classList.add("roster-add-modal");

  const heading = document.createElement("h2");
  heading.textContent = "Add PAX";

  const paxInput = document.createElement("input");
  paxInput.type = "text";
  paxInput.placeholder = "PAX name";

  const realInput = document.createElement("input");
  realInput.type = "text";
  realInput.placeholder = "Real name optional";

  const aoSelect = document.createElement("select");

  const blankAo = document.createElement("option");
  blankAo.value = "";
  blankAo.textContent = "Home AO optional";
  aoSelect.appendChild(blankAo);

  [...state.aos]
    .filter(ao => ao.isActive)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(ao => {
      const option = document.createElement("option");
      option.value = ao.name;
      option.textContent = ao.name;
      aoSelect.appendChild(option);
    });

  const buttonRow = document.createElement("div");
  buttonRow.classList.add("button-row");

  const cancelButton = document.createElement("button");
  cancelButton.classList.add("secondary-button");
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => overlay.remove());

  const saveButton = document.createElement("button");
  saveButton.textContent = "Save PAX";
  saveButton.classList.add("primary-button");

  saveButton.addEventListener("click", async () => {
    const paxName = paxInput.value.trim();
    const realName = realInput.value.trim();

    if (!paxName) {
      alert("PAX name is required.");
      return;
    }

    const duplicate = state.members.some(member =>
      getMemberDisplayName(member).trim().toLowerCase() === paxName.toLowerCase()
    );
    
    if (duplicate) {
      alert("A PAX with that name already exists.");
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    try {
      const member = {
      id: crypto.randomUUID(),
      paxName,
      realName: realName || null,
      homeAo: aoSelect.value || null,
      inviterIds: [],
      invitedById: null,
      firstPostDate: null,
      status: "active",
    };

    await addMember(member);

    overlay.remove();
    showToast("PAX added.");
    renderRoster();
  } catch (error) {
    console.error("Failed to add PAX:", error);
    alert("Failed to add PAX.");
    saveButton.disabled = false;
    saveButton.textContent = "Save PAX";
  }
});

  buttonRow.append(cancelButton, saveButton);

  modal.append(
    heading,
    paxInput,
    realInput,
    aoSelect,
    buttonRow
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}