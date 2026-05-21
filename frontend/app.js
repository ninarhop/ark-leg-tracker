const STORAGE_KEY = "arkLegTrackerWorkspace.v2";
const APP_VERSION = "2026-05-21d";
const PAGE_SIZE = 100;

const statusLabels = {
  "1": "Introduced",
  "2": "Engrossed",
  "3": "Enrolled",
  "4": "Passed",
  "5": "Vetoed",
  "6": "Failed"
};

const priorityOptions = ["urgent", "high", "normal", "low"];
const stanceOptions = ["unknown", "monitor", "support", "oppose", "neutral"];
const organizingOptions = [
  "research_needed",
  "no_action",
  "prepare_content",
  "prepare_testimony",
  "mobilize_for_hearing",
  "floor_vote_watch"
];

const policyBuckets = [
  { name: "Health Care", keywords: ["health", "medicaid", "hospital", "clinic", "doctor", "nurse", "insurance", "mental health", "abortion"] },
  { name: "Voting Rights", keywords: ["election", "voter", "ballot", "polling", "campaign", "initiative petition", "referendum", "redistricting"] },
  { name: "Agriculture", keywords: ["agriculture", "farm", "farmer", "crop", "livestock", "rural", "pesticide", "soil", "water district"] },
  { name: "Education", keywords: ["school", "student", "teacher", "curriculum", "college", "university", "tuition", "voucher", "library"] },
  { name: "Labor", keywords: ["worker", "wage", "employment", "union", "contractor", "unemployment", "workplace", "benefits"] },
  { name: "Housing", keywords: ["housing", "landlord", "tenant", "rent", "eviction", "homeless", "zoning", "property"] },
  { name: "Criminal Legal System", keywords: ["crime", "criminal", "police", "sheriff", "jail", "prison", "sentence", "probation", "parole", "court", "corrections"] },
  { name: "Civil Rights", keywords: ["civil rights", "discrimination", "religious freedom", "gender", "race", "lgbtq", "transgender", "disability"] },
  { name: "Environment", keywords: ["environment", "water", "air", "pollution", "energy", "utility", "climate", "conservation", "waste"] },
  { name: "Taxes and Budget", keywords: ["tax", "budget", "appropriation", "revenue", "fee", "credit", "exemption", "fiscal"] },
  { name: "Government Operations", keywords: ["department", "agency", "commission", "board", "procurement", "records", "ethics"] },
  { name: "Public Safety", keywords: ["emergency", "public safety", "fire", "disaster", "homeland", "military", "veteran"] }
];

const state = {
  bills: [],
  legislators: [],
  alerts: [],
  rollCalls: [],
  votesByBill: new Map(),
  votesByPerson: new Map(),
  automationStatus: null,
  generatedAt: "",
  source: "",
  selectedBillNumber: "",
  selectedPersonId: "",
  detailType: "bill",
  view: "overview",
  page: 0,
  sort: "priority",
  peopleFilter: "",
  filters: {
    search: "",
    bucket: "",
    priority: "",
    status: "",
    chamber: ""
  },
  workspace: loadWorkspace()
};

const els = {
  dataStatus: document.querySelector("#dataStatus"),
  searchInput: document.querySelector("#searchInput"),
  bucketFilter: document.querySelector("#bucketFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  chamberFilterLabel: document.querySelector("#chamberFilterLabel"),
  chamberFilter: document.querySelector("#chamberFilter"),
  sortFilter: document.querySelector("#sortFilter"),
  resetFilters: document.querySelector("#resetFilters"),
  metricGrid: document.querySelector("#metricGrid"),
  bucketTotal: document.querySelector("#bucketTotal"),
  sideFilterTitle: document.querySelector("#sideFilterTitle"),
  bucketList: document.querySelector("#bucketList"),
  workflowGrid: document.querySelector("#workflowGrid"),
  movementList: document.querySelector("#movementList"),
  alertList: document.querySelector("#alertList"),
  resultCount: document.querySelector("#resultCount"),
  billTable: document.querySelector("#billTable"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  queueList: document.querySelector("#queueList"),
  legislatorCount: document.querySelector("#legislatorCount"),
  legislatorGrid: document.querySelector("#legislatorGrid"),
  sourcePanel: document.querySelector("#sourcePanel"),
  detailPanel: document.querySelector("#detailPanel"),
  exportWorkspace: document.querySelector("#exportWorkspace"),
  toast: document.querySelector("#toast")
};

init();

async function init() {
  state.view = initialView();
  bindEvents();
  await loadData();
  hydrateFilters();
  applyView(state.view, { updateHash: false });
  renderAll();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => applyView(button.dataset.view));
  });

  els.searchInput.addEventListener("input", debounce(() => {
    state.filters.search = els.searchInput.value.trim();
    state.page = 0;
    renderAll();
  }, 180));

  [
    ["bucket", els.bucketFilter],
    ["priority", els.priorityFilter],
    ["status", els.statusFilter],
    ["chamber", els.chamberFilter]
  ].forEach(([key, element]) => {
    element.addEventListener("change", () => {
      state.filters[key] = element.value;
      if (key === "chamber" && state.view === "legislators") {
        state.peopleFilter = { House: "Rep", Senate: "Sen", Joint: "Jnt" }[element.value] || "";
      }
      state.page = 0;
      renderAll();
    });
  });

  els.sortFilter.addEventListener("change", () => {
    state.sort = els.sortFilter.value;
    state.page = 0;
    renderCurrentView();
    refreshIcons();
  });

  els.resetFilters.addEventListener("click", () => {
    state.filters = { search: "", bucket: "", priority: "", status: "", chamber: "" };
    els.searchInput.value = "";
    els.bucketFilter.value = "";
    els.priorityFilter.value = "";
    els.statusFilter.value = "";
    els.chamberFilter.value = "";
    els.sortFilter.value = "priority";
    state.sort = "priority";
    state.peopleFilter = "";
    state.page = 0;
    renderAll();
    showToast("Filters cleared");
  });

  els.prevPage.addEventListener("click", () => {
    state.page = Math.max(0, state.page - 1);
    renderBillsView();
  });

  els.nextPage.addEventListener("click", () => {
    state.page += 1;
    renderBillsView();
  });

  els.bucketList.addEventListener("click", (event) => {
    const peopleButton = event.target.closest("[data-people-filter]");
    if (peopleButton) {
      state.peopleFilter = peopleButton.dataset.peopleFilter;
      const chamberByRole = { Rep: "House", Sen: "Senate", Jnt: "Joint" };
      state.filters.chamber = chamberByRole[state.peopleFilter] || "";
      els.chamberFilter.value = state.filters.chamber;
      renderAll();
      return;
    }

    const button = event.target.closest("[data-bucket]");
    if (!button) return;
    state.filters.bucket = button.dataset.bucket;
    els.bucketFilter.value = button.dataset.bucket;
    state.page = 0;
    renderAll();
  });

  [els.billTable, els.movementList, els.alertList, els.queueList].forEach((container) => {
    container.addEventListener("click", (event) => {
      const sortButton = event.target.closest("[data-sort]");
      if (sortButton) {
        state.sort = sortButton.dataset.sort;
        els.sortFilter.value = state.sort;
        state.page = 0;
        renderBillsView();
        refreshIcons();
        return;
      }
      const row = event.target.closest("[data-bill-number]");
      if (!row) return;
      selectBill(row.dataset.billNumber);
    });
  });

  els.detailPanel.addEventListener("input", handleDetailInput);
  els.detailPanel.addEventListener("change", handleDetailInput);
  els.detailPanel.addEventListener("submit", handleDetailSubmit);
  els.detailPanel.addEventListener("click", handleDetailClick);

  els.exportWorkspace.addEventListener("click", exportWorkspaceNotes);

  els.legislatorGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-person-id]");
    if (!card) return;
    selectPerson(card.dataset.personId);
  });

  document.querySelectorAll("[data-people-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.peopleFilter = button.dataset.peopleFilter;
      const chamberByRole = { Rep: "House", Sen: "Senate", Jnt: "Joint" };
      state.filters.chamber = chamberByRole[state.peopleFilter] || "";
      els.chamberFilter.value = state.filters.chamber;
      renderAll();
      refreshIcons();
    });
  });

  window.addEventListener("hashchange", () => {
    applyView(initialView(), { updateHash: false });
  });
}

function initialView() {
  const hash = window.location.hash.replace("#", "").trim();
  const allowedViews = ["overview", "bills", "queue", "legislators", "sources"];
  return allowedViews.includes(hash) ? hash : "overview";
}

function applyView(view, options = {}) {
  const nextView = ["overview", "bills", "queue", "legislators", "sources"].includes(view) ? view : "overview";
  state.view = nextView;
  document.querySelectorAll("[data-view]").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.view));
  document.querySelectorAll(".view").forEach((viewElement) => viewElement.classList.remove("active-view"));
  document.querySelector(`#${state.view}View`)?.classList.add("active-view");
  if (options.updateHash !== false) {
    window.history.replaceState(null, "", `#${state.view}`);
  }
  applyFilterControlState();
  renderMetrics();
  renderBucketList();
  renderCurrentView();
  refreshIcons();
}

function applyFilterControlState() {
  const peopleView = state.view === "legislators";
  document.querySelectorAll(".bill-filter").forEach((field) => {
    field.hidden = peopleView;
  });
  els.chamberFilterLabel.textContent = peopleView ? "Group" : "Chamber";
}

async function loadData() {
  const trackerData = await fetchJson("tracker-data.json").catch(() => null);
  const legislators = await fetchJson("legislators.json").catch(() => []);
  const voteDetails = await fetchJson("vote-details.json").catch(() => null);
  state.automationStatus = await fetchJson("automation-status.json").catch(() => null);
  const fallbackBills = trackerData ? [] : await fetchJson("bills.json").catch(() => []);

  const rawBills = Array.isArray(trackerData?.bills) ? trackerData.bills : fallbackBills;
  state.bills = rawBills.map(normalizeBill);
  state.legislators = Array.isArray(legislators) ? legislators : [];
  state.alerts = Array.isArray(trackerData?.alerts) ? trackerData.alerts : [];
  state.rollCalls = Array.isArray(voteDetails?.roll_calls) ? voteDetails.roll_calls : [];
  buildVoteIndexes();
  state.generatedAt = trackerData?.generated_at || "";
  state.source = trackerData?.source || "GitHub frontend JSON";

  if (state.bills.length) {
    state.selectedBillNumber = state.bills[0].number;
  }
}

function normalizeBill(raw, index) {
  const number = String(raw.bill_number || raw.identifier || raw.billNumber || `BILL-${index + 1}`);
  const title = raw.title || raw.description || "Untitled bill";
  const summary = raw.description || raw.summary || raw.manual_summary || title;
  const statusCode = raw.status === null || raw.status === undefined ? "" : String(raw.status);
  const statusLabel = labelize(raw.status_label || statusLabels[statusCode] || raw.status || "Unknown");
  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  const amendments = Array.isArray(raw.amendments) ? raw.amendments : [];
  const texts = Array.isArray(raw.texts) ? raw.texts : [];
  const votes = Array.isArray(raw.votes) ? raw.votes : [];

  return {
    id: String(raw.id || number),
    number,
    session: raw.session || "",
    title,
    summary,
    chamber: normalizeChamber(raw.chamber, number),
    statusCode,
    statusLabel,
    statusDate: raw.status_date || "",
    officialUrl: raw.state_link || raw.official_url || "",
    legiscanBillId: raw.legiscan_bill_id || "",
    openstatesBillId: raw.openstates_bill_id || "",
    primaryBucket: raw.primary_bucket || classifyBucket(`${title} ${summary}`),
    priority: raw.priority || "normal",
    stance: raw.stance || "unknown",
    organizingStatus: raw.organizing_status || "research_needed",
    owner: raw.owner || "",
    manualSummary: raw.manual_summary || "",
    notes: raw.internal_notes || "",
    lastAction: raw.last_action || actions[0]?.description || "",
    lastActionDate: raw.last_action_date || actions[0]?.action_date || raw.status_date || "",
    actions,
    amendments,
    texts,
    votes,
    counts: {
      actions: raw.counts?.actions ?? actions.length,
      amendments: raw.counts?.amendments ?? amendments.length,
      texts: raw.counts?.texts ?? texts.length,
      votes: raw.counts?.votes ?? votes.length
    }
  };
}

function buildVoteIndexes() {
  state.votesByBill = new Map();
  state.votesByPerson = new Map();

  state.rollCalls.forEach((rollCall) => {
    const billNumber = String(rollCall.bill_number || "");
    if (!state.votesByBill.has(billNumber)) {
      state.votesByBill.set(billNumber, []);
    }
    state.votesByBill.get(billNumber).push(rollCall);

    (rollCall.member_votes || []).forEach((vote) => {
      const personId = String(vote.people_id || "");
      if (!personId) return;
      if (!state.votesByPerson.has(personId)) {
        state.votesByPerson.set(personId, { counts: { Yea: 0, Nay: 0, Other: 0 }, votes: [] });
      }
      const bucket = voteBucket(vote.vote_text);
      const record = state.votesByPerson.get(personId);
      record.counts[bucket] += 1;
      record.votes.push({
        ...vote,
        bill_number: billNumber,
        bill_title: rollCall.bill_title,
        roll_call_id: rollCall.roll_call_id,
        date: rollCall.date,
        motion: rollCall.motion,
        result: rollCall.result,
        chamber: rollCall.chamber,
        source_url: rollCall.source_url
      });
    });
  });

  state.votesByBill.forEach((rollCalls) => {
    rollCalls.sort((a, b) => dateValue(b.date) - dateValue(a.date));
  });
  state.votesByPerson.forEach((record) => {
    record.votes.sort((a, b) => dateValue(b.date) - dateValue(a.date));
  });
}

function hydrateFilters() {
  const buckets = unique([...policyBuckets.map((bucket) => bucket.name), ...state.bills.map((bill) => mergedBill(bill).bucket)])
    .filter(Boolean)
    .sort();
  const statuses = unique(state.bills.map((bill) => bill.statusLabel)).filter(Boolean).sort();

  els.bucketFilter.innerHTML = `<option value="">All</option>${buckets.map((bucket) => optionHtml(bucket, bucket)).join("")}`;
  els.statusFilter.innerHTML = `<option value="">All</option>${statuses.map((status) => optionHtml(status, status)).join("")}`;
}

function renderAll() {
  renderMetrics();
  renderBucketList();
  renderCurrentView();
  renderDetail();
  updateDataStatus();
  refreshIcons();
}

function renderCurrentView() {
  if (state.view === "overview") renderOverview();
  if (state.view === "bills") renderBillsView();
  if (state.view === "queue") renderQueueView();
  if (state.view === "legislators") renderLegislatorsView();
  if (state.view === "sources") renderSourcesView();
}

function renderMetrics() {
  const bills = state.bills.map(mergedBill);
  const queue = getQueueBills();
  const drafts = bills.filter((bill) => bill.lastDraft).length;
  const amendmentCount = bills.reduce((sum, bill) => sum + bill.amendments.length, 0);
  const textCount = bills.reduce((sum, bill) => sum + bill.texts.length, 0);

  els.metricGrid.innerHTML = [
    metric("Bills", bills.length),
    metric("People", state.legislators.length),
    metric("Member Votes", state.rollCalls.reduce((sum, rollCall) => sum + (rollCall.member_votes || []).length, 0)),
    metric("Text Links", textCount),
    metric("Amendments", amendmentCount),
    metric("Queue", queue.length),
    metric("Alerts", state.alerts.length),
    metric("Drafts", drafts)
  ].join("");
}

function renderBucketList() {
  if (state.view === "legislators") {
    const counts = {
      "All People": state.legislators.length,
      House: state.legislators.filter((person) => person.role === "Rep").length,
      Senate: state.legislators.filter((person) => person.role === "Sen").length,
      Committees: state.legislators.filter((person) => person.role === "Jnt").length
    };
    els.sideFilterTitle.textContent = "People Groups";
    els.bucketTotal.textContent = `${formatNumber(state.legislators.length)} people`;
    els.bucketList.innerHTML = `
      <button class="bucket-row ${state.peopleFilter === "" ? "active" : ""}" type="button" data-people-filter="">
        <span>All People</span>
        <strong>${formatNumber(counts["All People"])}</strong>
      </button>
      <button class="bucket-row ${state.peopleFilter === "Rep" ? "active" : ""}" type="button" data-people-filter="Rep">
        <span>House</span>
        <strong>${formatNumber(counts.House)}</strong>
      </button>
      <button class="bucket-row ${state.peopleFilter === "Sen" ? "active" : ""}" type="button" data-people-filter="Sen">
        <span>Senate</span>
        <strong>${formatNumber(counts.Senate)}</strong>
      </button>
      <button class="bucket-row ${state.peopleFilter === "Jnt" ? "active" : ""}" type="button" data-people-filter="Jnt">
        <span>Committees</span>
        <strong>${formatNumber(counts.Committees)}</strong>
      </button>
    `;
    return;
  }

  els.sideFilterTitle.textContent = "Policy Buckets";
  const counts = countBy(state.bills.map((bill) => mergedBill(bill).bucket || "Unbucketed"));
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  els.bucketTotal.textContent = `${rows.length} buckets`;
  els.bucketList.innerHTML = rows.map(([bucket, count]) => `
    <button class="bucket-row ${state.filters.bucket === bucket ? "active" : ""}" type="button" data-bucket="${escapeAttr(bucket)}">
      <span>${escapeHtml(bucket)}</span>
      <strong>${formatNumber(count)}</strong>
    </button>
  `).join("");
}

function renderOverview() {
  const bills = state.bills.map(mergedBill);
  const queue = getQueueBills();
  const amendmentReview = bills.reduce((sum, bill) => sum + bill.amendments.filter((amendment) => !isReviewed(amendment)).length, 0);
  const textCount = bills.reduce((sum, bill) => sum + bill.texts.length, 0);
  const contentDrafts = bills.filter((bill) => bill.lastDraft).length;

  els.workflowGrid.innerHTML = [
    workflowCard("scroll-text", "Bills + Text", bills.length, `${formatNumber(textCount)} bill text records`),
    workflowCard("file-pen-line", "Amendments", amendmentReview, "open amendment reviews"),
    workflowCard("calendar-clock", "Schedule Watch", queue.length, "bills in the action queue"),
    workflowCard("megaphone", "Content", contentDrafts, "saved bill drafts")
  ].join("");

  const movementRows = bills
    .filter((bill) => bill.lastAction)
    .sort((a, b) => dateValue(b.lastActionDate) - dateValue(a.lastActionDate))
    .slice(0, 10);
  els.movementList.innerHTML = movementRows.map((bill) => compactBillRow(bill, bill.lastAction, bill.lastActionDate)).join("") ||
    emptyState("No bill movement loaded");

  els.alertList.innerHTML = state.alerts.slice(0, 10).map((alert) => {
    const bill = findBillForAlert(alert);
    const billNumber = bill?.number || alert.bill_id || "";
    return `
      <div class="compact-row" ${bill ? `data-bill-number="${escapeAttr(bill.number)}"` : ""}>
        <div class="chip-row">
          ${priorityPill(alert.priority || "normal")}
          <strong>${escapeHtml(billNumber)}</strong>
        </div>
        <div>${escapeHtml(alert.title || labelize(alert.alert_type || "Alert"))}</div>
        <div class="subline">${escapeHtml(alert.message || "")}</div>
      </div>
    `;
  }).join("") || emptyState("No active alerts loaded");
}

function renderBillsView() {
  const bills = getVisibleBills();
  const totalPages = Math.max(1, Math.ceil(bills.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages - 1);
  const start = state.page * PAGE_SIZE;
  const pageBills = bills.slice(start, start + PAGE_SIZE);

  els.resultCount.textContent = `${formatNumber(bills.length)} matching bills - page ${state.page + 1} of ${totalPages}`;
  els.prevPage.disabled = state.page === 0;
  els.nextPage.disabled = state.page >= totalPages - 1;

  els.billTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="col-bill"><button type="button" data-sort="bill">Bill</button></th>
          <th>Title + Bucket</th>
          <th class="col-status"><button type="button" data-sort="status">Status</button></th>
          <th class="col-counts"><button type="button" data-sort="amendments">Records</button></th>
          <th class="col-priority"><button type="button" data-sort="priority">Priority</button></th>
          <th class="col-action">Details</th>
        </tr>
      </thead>
      <tbody>
        ${pageBills.map(renderBillRow).join("") || `<tr><td colspan="6">${emptyState("No bills match these filters")}</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderBillRow(bill) {
  return `
    <tr class="${state.selectedBillNumber === bill.number ? "selected" : ""}" data-bill-number="${escapeAttr(bill.number)}">
      <td class="col-bill">
        <strong>${escapeHtml(bill.number)}</strong>
        <div class="subline">${escapeHtml(bill.chamber)}</div>
      </td>
      <td>
        <div class="title-cell">
          <strong>${escapeHtml(bill.title)}</strong>
          <div class="chip-row">
            <span class="badge">${escapeHtml(bill.bucket || "Unbucketed")}</span>
            ${stancePill(bill.stance)}
          </div>
          <div class="subline">${escapeHtml(bill.lastAction || bill.summary || "")}</div>
        </div>
      </td>
      <td class="col-status">
        ${escapeHtml(bill.statusLabel)}
        <div class="subline">${escapeHtml(bill.lastActionDate || bill.statusDate || "")}</div>
      </td>
      <td class="col-counts">
        <div>${formatNumber(bill.texts.length)} texts</div>
        <div class="subline">${formatNumber(bill.amendments.length)} amend. - ${formatNumber(bill.votes.length)} votes</div>
      </td>
      <td class="col-priority">${priorityPill(bill.priority)}</td>
      <td class="col-action">
        <button type="button" data-bill-number="${escapeAttr(bill.number)}">
          <i data-lucide="panel-right-open"></i>
          Open
        </button>
      </td>
    </tr>
  `;
}

function renderQueueView() {
  const queue = getQueueBills().filter(matchesFilters).slice(0, 120);
  els.queueList.innerHTML = queue.map((bill) => {
    const reasons = queueReasons(bill);
    return `
      <article class="queue-card" data-bill-number="${escapeAttr(bill.number)}">
        <div class="chip-row">
          <strong>${escapeHtml(bill.number)}</strong>
          ${priorityPill(bill.priority)}
          <span class="badge">${escapeHtml(bill.bucket || "Unbucketed")}</span>
        </div>
        <h3>${escapeHtml(bill.title)}</h3>
        <p class="subline">${escapeHtml(reasons.join(" - "))}</p>
        <p>${escapeHtml(bill.lastAction || bill.summary || "")}</p>
      </article>
    `;
  }).join("") || emptyState("No queue items match these filters. Clear filters or choose a different bucket/priority.");
}

function renderLegislatorsView() {
  const search = state.filters.search.toLowerCase();
  const chamberRole = state.filters.chamber === "House"
    ? "Rep"
    : state.filters.chamber === "Senate"
      ? "Sen"
      : state.filters.chamber === "Joint"
        ? "Jnt"
        : "";
  document.querySelectorAll("[data-people-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.peopleFilter === state.peopleFilter);
  });
  const legislators = state.legislators.filter((person) => {
    if (state.peopleFilter && person.role !== state.peopleFilter) return false;
    if (chamberRole && person.role !== chamberRole) return false;
    const haystack = `${person.name || ""} ${person.district || ""} ${person.role || ""} ${partyLabel(person.party_id)}`.toLowerCase();
    return !search || haystack.includes(search);
  }).sort((a, b) => roleLabel(a.role).localeCompare(roleLabel(b.role)) || String(a.district || "").localeCompare(String(b.district || ""), undefined, { numeric: true }) || String(a.name || "").localeCompare(String(b.name || "")));

  els.legislatorCount.textContent = `${formatNumber(legislators.length)} shown out of ${formatNumber(state.legislators.length)} people and committees - click a card to open vote history`;
  els.legislatorGrid.innerHTML = legislators.map((person) => `
    <article class="legislator-card ${String(person.people_id) === state.selectedPersonId ? "selected" : ""}" data-person-id="${escapeAttr(person.people_id)}">
      <div>
        <h3>${escapeHtml(person.name || "Unknown")}</h3>
        <p class="subline">${escapeHtml(roleLabel(person.role))} ${escapeHtml(person.district || "")}</p>
      </div>
      <div class="chip-row">
        <span class="badge">${escapeHtml(partyLabel(person.party_id))}</span>
        ${personVoteBadges(person.people_id)}
      </div>
      <button type="button" class="open-profile" data-person-id="${escapeAttr(person.people_id)}">
        <i data-lucide="panel-right-open"></i>
        Open Profile
      </button>
    </article>
  `).join("") || emptyState("No legislators match the current search");
}

function renderSourcesView() {
  const bills = state.bills.map(mergedBill);
  const textCount = bills.reduce((sum, bill) => sum + bill.texts.length, 0);
  const amendmentCount = bills.reduce((sum, bill) => sum + bill.amendments.length, 0);
  const voteCount = bills.reduce((sum, bill) => sum + bill.votes.length, 0);
  const actionCount = bills.reduce((sum, bill) => sum + bill.actions.length, 0);
  const automation = state.automationStatus;

  els.sourcePanel.innerHTML = [
    sourceCard("Current Dataset", [
      `${formatNumber(bills.length)} bills`,
      `${formatNumber(textCount)} text links`,
      `${formatNumber(amendmentCount)} amendments`,
      `${formatNumber(voteCount)} votes`,
      `${formatNumber(actionCount)} actions`
    ], state.source),
    sourceCard("Automation", automation ? [
      `Last data change check: ${formatDateTime(automation.checked_at)}`,
      `${formatNumber(automation.changed_bills || 0)} changed bills in last committed run`,
      `${formatNumber(automation.new_bills || 0)} newly filed bills in last committed run`,
      `${formatNumber(automation.sessions?.length || 0)} LegiScan sessions watched`
    ] : [
      "Waiting for the first GitHub Actions polling run",
      "Requires the LEGISCAN_API_KEY repository secret"
    ], "Polls LegiScan from GitHub Actions and commits new static data to the site."),
    sourceCard("Arkansas Legislature", [
      linkHtml("Bill Search", "https://www.arkleg.state.ar.us/Bills/Search"),
      linkHtml("Recent Activity", "https://www.arkleg.state.ar.us/Bills/RecentActivity"),
      linkHtml("Committee Agendas", "https://arkleg.state.ar.us/Calendars/BillsCommittee"),
      linkHtml("Meetings", "https://www.arkleg.state.ar.us/Calendars/Meetings")
    ], "Official bill, agenda, meeting, and calendar pages."),
    sourceCard("Video Sources", [
      linkHtml("AR-CAN", "https://www.arkansastv.gov/arcan"),
      linkHtml("House Video", "https://www.arkansashouse.org/watch-live"),
      linkHtml("Senate Streams", "https://senate.arkansas.gov/todays-live-stream-meetings/")
    ], "Use the bill detail panel to store meeting URLs and timecodes."),
    sourceCard("Manual Workspace", [
      `${formatNumber(Object.keys(state.workspace.bills || {}).length)} bills with saved notes`,
      "Buckets, priority, stance, clips, amendment notes, and drafts"
    ], "Saved in this browser with localStorage; export notes before switching machines.")
  ].join("");
}

function renderDetail() {
  if (state.detailType === "person") {
    renderPersonDetail();
    return;
  }

  const bill = selectedBill();
  if (!bill) {
    els.detailPanel.innerHTML = `
      <div class="empty-detail">
        <i data-lucide="mouse-pointer-click"></i>
        <h2>Select a bill</h2>
        <p>Open a bill to review text links, amendments, movement, votes, video timecodes, and content drafts.</p>
      </div>
    `;
    return;
  }

  els.detailPanel.innerHTML = `
    <div class="detail-head">
      <div class="chip-row">
        <span class="badge">${escapeHtml(bill.number)}</span>
        ${priorityPill(bill.priority)}
        ${stancePill(bill.stance)}
      </div>
      <div class="detail-title">
        <h2>${escapeHtml(bill.title)}</h2>
        <p class="detail-summary">${escapeHtml(bill.manualSummary || bill.summary || "")}</p>
      </div>
      <div class="detail-actions">
        ${bill.officialUrl ? `<a class="link-button" href="${escapeAttr(bill.officialUrl)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>Official Bill</a>` : ""}
      </div>
    </div>

    <form class="detail-form" data-review-form>
      <div class="detail-grid">
        <label>Priority ${selectHtml("priority", priorityOptions, bill.priority)}</label>
        <label>Stance ${selectHtml("stance", stanceOptions, bill.stance)}</label>
        <label>Bucket ${selectHtml("bucket", unique([...policyBuckets.map((item) => item.name), bill.bucket]).sort(), bill.bucket)}</label>
        <label>Organizing ${selectHtml("organizingStatus", organizingOptions, bill.organizingStatus)}</label>
        <label>Owner <input data-review-field="owner" value="${escapeAttr(bill.owner || "")}"></label>
        <label>Manual Summary <input data-review-field="manualSummary" value="${escapeAttr(bill.manualSummary || "")}"></label>
      </div>
      <label>Internal Notes <textarea data-review-field="notes">${escapeHtml(bill.notes || "")}</textarea></label>
    </form>

    <section class="detail-section">
      <div class="section-head"><h3>Progress</h3><span class="muted">${escapeHtml(bill.statusLabel)}</span></div>
      ${renderProgress(bill)}
    </section>

    ${renderDocuments("Bill Text", bill.texts, renderTextRecord)}
    ${renderDocuments("Amendments", bill.amendments, renderAmendmentRecord)}
    ${renderTimeline(bill.actions)}
    ${renderDocuments("Votes", bill.votes, renderVoteRecord)}
    ${renderMemberVotesSection(bill)}
    ${renderVideoSection(bill)}
    ${renderContentSection(bill)}
  `;
}

function renderPersonDetail() {
  const person = selectedPerson();
  if (!person) {
    els.detailPanel.innerHTML = `
      <div class="empty-detail">
        <i data-lucide="users"></i>
        <h2>Select a legislator</h2>
        <p>Choose a representative or senator to view their yea/nay history.</p>
      </div>
    `;
    return;
  }

  const voteRecord = state.votesByPerson.get(String(person.people_id)) || { counts: { Yea: 0, Nay: 0, Other: 0 }, votes: [] };
  const votes = voteRecord.votes;
  els.detailPanel.innerHTML = `
    <div class="detail-head">
      <div class="chip-row">
        <span class="badge">${escapeHtml(roleLabel(person.role))}</span>
        <span class="badge">${escapeHtml(person.district || "No district")}</span>
        <span class="badge">${escapeHtml(partyLabel(person.party_id))}</span>
      </div>
      <div class="detail-title">
        <h2>${escapeHtml(person.name || "Unknown")}</h2>
        <p class="detail-summary">${formatNumber(votes.length)} recorded roll-call votes loaded from LegiScan.</p>
      </div>
    </div>

    <section class="detail-section">
      <div class="section-head"><h3>Vote Summary</h3></div>
      <div class="metric-grid compact-metrics">
        ${metric("Yea", voteRecord.counts.Yea)}
        ${metric("Nay", voteRecord.counts.Nay)}
        ${metric("Other", voteRecord.counts.Other)}
      </div>
    </section>

    <section class="detail-section">
      <div class="section-head">
        <h3>Votes By Bill</h3>
        <span class="muted">${formatNumber(votes.length)}</span>
      </div>
      <div class="vote-history">
        ${votes.map(renderPersonVoteRow).join("") || `<div class="subline">No individual votes loaded for this person.</div>`}
      </div>
    </section>
  `;
}

function renderProgress(bill) {
  const labels = ["Filed", "Committee", "Floor", "Governor", "Done"];
  const active = progressIndex(bill);
  return `
    <div class="progress-steps">
      ${labels.map((label, index) => `
        <div class="progress-step ${index < active ? "done" : ""} ${index === active ? "active" : ""}">
          <strong>${escapeHtml(label)}</strong>
          <span>${index < active ? "Complete" : index === active ? "Current" : "Pending"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDocuments(title, rows, renderer) {
  return `
    <section class="detail-section">
      <div class="section-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="muted">${formatNumber(rows.length)}</span>
      </div>
      <div class="document-list">
        ${rows.map(renderer).join("") || `<div class="subline">No records</div>`}
      </div>
      ${title === "Amendments" ? amendmentFormHtml() : ""}
    </section>
  `;
}

function renderTextRecord(row) {
  return `
    <div class="document-row">
      <a href="${escapeAttr(row.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(row.version_label || row.label || "Bill text")}</a>
      <div class="subline">${escapeHtml(row.document_date || "")} ${escapeHtml(row.mime_type || "")}</div>
    </div>
  `;
}

function renderAmendmentRecord(row) {
  return `
    <div class="document-row">
      <div class="chip-row">
        ${row.url ? `<a href="${escapeAttr(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.amendment_label || row.label || "Amendment")}</a>` : `<strong>${escapeHtml(row.amendment_label || row.label || "Amendment")}</strong>`}
        <span class="badge">${escapeHtml(row.review_status || row.reviewStatus || "new")}</span>
        ${row.manual ? `<button class="icon-button" type="button" title="Remove amendment note" aria-label="Remove amendment note" data-delete-kind="amendment" data-delete-id="${escapeAttr(row.id)}"><i data-lucide="trash-2"></i></button>` : ""}
      </div>
      <div>${escapeHtml(row.description || row.notes || "")}</div>
      <div class="subline">${escapeHtml(row.document_date || row.date || "")} ${escapeHtml(row.status || "")}</div>
    </div>
  `;
}

function renderVoteRecord(row) {
  return `
    <div class="document-row">
      <a href="${escapeAttr(row.source_url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(row.motion || "Vote")}</a>
      <div class="subline">${escapeHtml(row.vote_date || "")} - ${escapeHtml(row.organization || "")} - ${escapeHtml(row.result || "")} ${formatNumber(row.yes_count || 0)}-${formatNumber(row.no_count || 0)}</div>
    </div>
  `;
}

function renderMemberVotesSection(bill) {
  const rollCalls = state.votesByBill.get(bill.number) || [];
  return `
    <section class="detail-section">
      <div class="section-head">
        <h3>Member Yea/Nay Votes</h3>
        <span class="muted">${formatNumber(rollCalls.reduce((sum, rollCall) => sum + (rollCall.member_votes || []).length, 0))}</span>
      </div>
      <div class="roll-call-list">
        ${rollCalls.map(renderRollCallMembers).join("") || `<div class="subline">No individual member votes loaded for this bill.</div>`}
      </div>
    </section>
  `;
}

function renderRollCallMembers(rollCall) {
  const grouped = groupMemberVotes(rollCall.member_votes || []);
  return `
    <details class="roll-call" open>
      <summary>
        <span>${escapeHtml(rollCall.date || "")} - ${escapeHtml(rollCall.motion || "Roll call")}</span>
        <strong>${formatNumber(grouped.Yea.length)}-${formatNumber(grouped.Nay.length)}</strong>
      </summary>
      <div class="roll-call-meta">
        <span class="badge">${escapeHtml(roleLabel(rollCall.chamber) || rollCall.chamber || "")}</span>
        <span class="badge">${escapeHtml(labelize(rollCall.result || ""))}</span>
      </div>
      <div class="vote-groups">
        ${renderVoteGroup("Yea", grouped.Yea)}
        ${renderVoteGroup("Nay", grouped.Nay)}
        ${renderVoteGroup("Other", grouped.Other)}
      </div>
    </details>
  `;
}

function renderVoteGroup(label, votes) {
  return `
    <div class="vote-group">
      <h4>${escapeHtml(label)} <span>${formatNumber(votes.length)}</span></h4>
      <div class="vote-member-list">
        ${votes.map((vote) => `
          <button type="button" class="vote-member vote-${escapeAttr(label.toLowerCase())}" data-person-id="${escapeAttr(vote.people_id)}" data-select-person="true">
            <span>${escapeHtml(vote.name || `Person ${vote.people_id}`)}</span>
            <small>${escapeHtml(vote.district || "")}</small>
          </button>
        `).join("") || `<div class="subline">None</div>`}
      </div>
    </div>
  `;
}

function renderPersonVoteRow(vote) {
  return `
    <article class="person-vote-row vote-${escapeAttr(voteBucket(vote.vote_text).toLowerCase())}">
      <div class="chip-row">
        <strong>${escapeHtml(vote.vote_text || "Vote")}</strong>
        <button type="button" data-bill-number="${escapeAttr(vote.bill_number)}">
          ${escapeHtml(vote.bill_number)}
        </button>
        <span class="badge">${escapeHtml(vote.date || "")}</span>
      </div>
      <h4>${escapeHtml(vote.bill_title || "")}</h4>
      <p class="subline">${escapeHtml(vote.motion || "Roll call")} - ${escapeHtml(labelize(vote.result || ""))}</p>
      ${vote.source_url ? `<a href="${escapeAttr(vote.source_url)}" target="_blank" rel="noreferrer">Official vote record</a>` : ""}
    </article>
  `;
}

function renderTimeline(actions) {
  const rows = actions.slice(0, 18);
  return `
    <section class="detail-section">
      <div class="section-head">
        <h3>Movement</h3>
        <span class="muted">${formatNumber(actions.length)}</span>
      </div>
      <div class="timeline">
        ${rows.map((row) => `
          <div class="timeline-row">
            <strong>${escapeHtml(row.action_date || "")}</strong>
            <div>${escapeHtml(row.description || "")}</div>
            <div class="subline">${escapeHtml(row.classification || "")} ${escapeHtml(row.organization || "")}</div>
          </div>
        `).join("") || `<div class="subline">No movement records</div>`}
      </div>
    </section>
  `;
}

function renderVideoSection(bill) {
  return `
    <section class="detail-section">
      <div class="section-head">
        <h3>Video Clips + Timecodes</h3>
        <span class="muted">${formatNumber(bill.clips.length)}</span>
      </div>
      <div class="video-list">
        ${bill.clips.map((clip) => `
          <div class="video-row">
            <div class="chip-row">
              <strong>${escapeHtml(clip.legislator || "Meeting clip")}</strong>
              <span class="badge">${escapeHtml([clip.start, clip.end].filter(Boolean).join(" - ") || "timecode")}</span>
              <button class="icon-button" type="button" title="Remove clip" aria-label="Remove clip" data-delete-kind="clip" data-delete-id="${escapeAttr(clip.id)}"><i data-lucide="trash-2"></i></button>
            </div>
            ${clip.url ? `<a href="${escapeAttr(clip.url)}" target="_blank" rel="noreferrer">${escapeHtml(clip.url)}</a>` : ""}
            <div>${escapeHtml(clip.context || "")}</div>
          </div>
        `).join("") || `<div class="subline">No timecodes saved</div>`}
      </div>
      <form class="small-form" data-form="clip">
        <div class="form-row">
          <label>Legislator <input name="legislator" placeholder="Name"></label>
          <label>Meeting URL <input name="url" placeholder="https://"></label>
        </div>
        <div class="form-row">
          <label>Start <input name="start" placeholder="01:12:03"></label>
          <label>End <input name="end" placeholder="01:14:20"></label>
        </div>
        <label>Context <textarea name="context" placeholder="What happened in the clip"></textarea></label>
        <button class="primary" type="submit"><i data-lucide="plus"></i>Add Timecode</button>
      </form>
    </section>
  `;
}

function renderContentSection(bill) {
  return `
    <section class="detail-section">
      <div class="section-head">
        <h3>Content Drafts</h3>
        <button class="icon-button" id="copyDraft" type="button" title="Copy draft" aria-label="Copy draft">
          <i data-lucide="copy"></i>
        </button>
      </div>
      <div class="content-tools">
        <div class="content-buttons">
          <button type="button" data-draft-type="action_alert"><i data-lucide="megaphone"></i>Action Alert</button>
          <button type="button" data-draft-type="social_post"><i data-lucide="message-square-text"></i>Social Post</button>
          <button type="button" data-draft-type="testimony_prompt"><i data-lucide="mic"></i>Testimony Prompt</button>
          <button type="button" data-draft-type="explainer"><i data-lucide="file-text"></i>Explainer</button>
        </div>
        <textarea id="contentDraft" data-review-field="lastDraft">${escapeHtml(bill.lastDraft || generateDraft("explainer", bill))}</textarea>
      </div>
    </section>
  `;
}

function amendmentFormHtml() {
  return `
    <form class="small-form" data-form="amendment">
      <div class="form-row">
        <label>Label <input name="label" placeholder="Amendment 1"></label>
        <label>Status <input name="status" placeholder="new, reviewed, concerning"></label>
      </div>
      <label>URL <input name="url" placeholder="https://"></label>
      <label>Notes <textarea name="notes" placeholder="What changed and why it matters"></textarea></label>
      <button class="primary" type="submit"><i data-lucide="plus"></i>Add Amendment Note</button>
    </form>
  `;
}

function handleDetailInput(event) {
  const field = event.target.dataset.reviewField;
  if (!field || !state.selectedBillNumber) return;

  updateManualBill(state.selectedBillNumber, (manual) => {
    manual[field] = event.target.value;
    return manual;
  });

  renderMetrics();
  renderBucketList();
  renderCurrentView();
}

function handleDetailSubmit(event) {
  const form = event.target.closest("[data-form]");
  if (!form || !state.selectedBillNumber) return;
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  const formType = form.dataset.form;
  updateManualBill(state.selectedBillNumber, (manual) => {
    if (formType === "amendment") {
      manual.amendments = manual.amendments || [];
      manual.amendments.push({
        id: makeId(),
        manual: true,
        label: clean(data.label) || "Amendment note",
        status: clean(data.status) || "new",
        reviewStatus: clean(data.status) || "new",
        url: clean(data.url),
        notes: clean(data.notes),
        date: new Date().toISOString().slice(0, 10)
      });
    }
    if (formType === "clip") {
      manual.clips = manual.clips || [];
      manual.clips.push({
        id: makeId(),
        legislator: clean(data.legislator),
        url: clean(data.url),
        start: clean(data.start),
        end: clean(data.end),
        context: clean(data.context)
      });
    }
    return manual;
  });

  form.reset();
  renderAll();
  showToast(formType === "clip" ? "Timecode saved" : "Amendment note saved");
}

function handleDetailClick(event) {
  const personTarget = event.target.closest("[data-select-person]");
  if (personTarget) {
    selectPerson(personTarget.dataset.personId);
    return;
  }

  const billTarget = event.target.closest("[data-bill-number]");
  if (billTarget) {
    selectBill(billTarget.dataset.billNumber);
    return;
  }

  const draftButton = event.target.closest("[data-draft-type]");
  if (draftButton) {
    const bill = selectedBill();
    const draft = generateDraft(draftButton.dataset.draftType, bill);
    const draftBox = document.querySelector("#contentDraft");
    draftBox.value = draft;
    updateManualBill(bill.number, (manual) => {
      manual.lastDraft = draft;
      return manual;
    });
    renderMetrics();
    showToast("Draft generated");
    return;
  }

  const copyButton = event.target.closest("#copyDraft");
  if (copyButton) {
    const draft = document.querySelector("#contentDraft")?.value || "";
    copyText(draft);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-kind]");
  if (deleteButton && state.selectedBillNumber) {
    const { deleteKind, deleteId } = deleteButton.dataset;
    updateManualBill(state.selectedBillNumber, (manual) => {
      if (deleteKind === "amendment") {
        manual.amendments = (manual.amendments || []).filter((item) => item.id !== deleteId);
      }
      if (deleteKind === "clip") {
        manual.clips = (manual.clips || []).filter((item) => item.id !== deleteId);
      }
      return manual;
    });
    renderAll();
    showToast("Removed");
  }
}

function generateDraft(type, bill) {
  const stance = bill.stance && bill.stance !== "unknown" ? labelize(bill.stance) : "Monitor";
  const action = bill.lastAction || bill.statusLabel;
  const billLine = `${bill.number}: ${bill.title}`;
  const link = bill.officialUrl ? `\n\nOfficial bill link: ${bill.officialUrl}` : "";

  if (type === "action_alert") {
    return `${stance} alert: ${billLine}\n\nCurrent status: ${bill.statusLabel}. Latest movement: ${action}.\n\nWhy it matters: ${bill.manualSummary || bill.summary}\n\nAsk: Contact lawmakers, watch the calendar, and be ready to testify if this bill is placed on a committee agenda.${link}`;
  }

  if (type === "social_post") {
    return `${bill.number} is moving at the Arkansas Legislature.\n\n${bill.title}\n\nStatus: ${bill.statusLabel}\nLatest: ${action}\n\nFor AR People is tracking this under ${bill.bucket || "policy watch"}.${link}`;
  }

  if (type === "testimony_prompt") {
    return `Testimony prep for ${bill.number}\n\nBill: ${bill.title}\nPosition: ${stance}\nCommittee/floor watch: ${labelize(bill.organizingStatus)}\n\nCore facts:\n- Status: ${bill.statusLabel}\n- Latest movement: ${action}\n- Policy bucket: ${bill.bucket || "Unbucketed"}\n\nPersonal impact to add:\n- Who is affected?\n- What changes if this passes?\n- What should the committee do?${link}`;
  }

  return `${billLine}\n\nBucket: ${bill.bucket || "Unbucketed"}\nStatus: ${bill.statusLabel}\nLatest movement: ${action}\n\nSummary:\n${bill.manualSummary || bill.summary}\n\nRecords attached: ${bill.texts.length} bill text links, ${bill.amendments.length} amendments, ${bill.votes.length} votes, ${bill.actions.length} actions.${link}`;
}

function getVisibleBills() {
  return state.bills
    .map(mergedBill)
    .filter(matchesFilters)
    .sort(sortBills);
}

function getQueueBills() {
  return state.bills
    .map(mergedBill)
    .filter((bill) => queueReasons(bill).length > 0)
    .sort(sortBills);
}

function queueReasons(bill) {
  const reasons = [];
  if (["urgent", "high"].includes(bill.priority)) reasons.push(`${labelize(bill.priority)} priority`);
  if (["prepare_content", "prepare_testimony", "mobilize_for_hearing", "floor_vote_watch"].includes(bill.organizingStatus)) {
    reasons.push(labelize(bill.organizingStatus));
  }
  const openAmendments = bill.amendments.filter((item) => !isReviewed(item)).length;
  if (openAmendments) reasons.push(`${formatNumber(openAmendments)} amendment review${openAmendments === 1 ? "" : "s"}`);
  if (findAlertForBill(bill)) reasons.push("active alert");
  return reasons;
}

function matchesFilters(bill) {
  const search = state.filters.search.toLowerCase();
  if (search) {
    const haystack = `${bill.number} ${bill.title} ${bill.summary} ${bill.bucket} ${bill.statusLabel} ${bill.lastAction}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (state.filters.bucket && bill.bucket !== state.filters.bucket) return false;
  if (state.filters.priority) {
    if (state.filters.priority === "flagged" && !["urgent", "high"].includes(bill.priority)) return false;
    if (state.filters.priority !== "flagged" && bill.priority !== state.filters.priority) return false;
  }
  if (state.filters.status && bill.statusLabel !== state.filters.status) return false;
  if (state.filters.chamber && bill.chamber !== state.filters.chamber) return false;
  return true;
}

function mergedBill(bill) {
  const manual = state.workspace.bills?.[bill.number] || {};
  const manualAmendments = (manual.amendments || []).map((item) => ({ ...item, manual: true }));
  return {
    ...bill,
    bucket: manual.bucket || bill.primaryBucket || classifyBucket(`${bill.title} ${bill.summary}`),
    priority: manual.priority || bill.priority || "normal",
    stance: manual.stance || bill.stance || "unknown",
    organizingStatus: manual.organizingStatus || bill.organizingStatus || "research_needed",
    owner: manual.owner ?? bill.owner,
    manualSummary: manual.manualSummary ?? bill.manualSummary,
    notes: manual.notes ?? bill.notes,
    lastDraft: manual.lastDraft || "",
    amendments: [...bill.amendments, ...manualAmendments],
    clips: manual.clips || []
  };
}

function selectedBill() {
  const raw = state.bills.find((bill) => bill.number === state.selectedBillNumber);
  return raw ? mergedBill(raw) : null;
}

function selectBill(number) {
  state.detailType = "bill";
  state.selectedBillNumber = number;
  renderDetail();
  renderCurrentView();
  focusDetailPanel();
  refreshIcons();
}

function selectPerson(personId) {
  state.detailType = "person";
  state.selectedPersonId = String(personId || "");
  renderDetail();
  renderCurrentView();
  focusDetailPanel();
  refreshIcons();
}

function focusDetailPanel() {
  els.detailPanel.classList.remove("flash");
  void els.detailPanel.offsetWidth;
  els.detailPanel.classList.add("flash");
  if (window.matchMedia("(max-width: 1220px)").matches) {
    els.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function selectedPerson() {
  return state.legislators.find((person) => String(person.people_id) === String(state.selectedPersonId));
}

function updateManualBill(number, updater) {
  state.workspace.bills = state.workspace.bills || {};
  const current = { ...(state.workspace.bills[number] || {}) };
  const next = updater(current) || current;
  state.workspace.bills[number] = next;
  saveWorkspace();
}

function loadWorkspace() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { bills: {} };
  } catch {
    return { bills: {} };
  }
}

function saveWorkspace() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.workspace));
}

function exportWorkspaceNotes() {
  const payload = JSON.stringify({
    exported_at: new Date().toISOString(),
    workspace: state.workspace
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ark-leg-workspace-notes.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Workspace notes exported");
}

function updateDataStatus() {
  const date = state.generatedAt ? new Date(state.generatedAt) : null;
  const stamp = date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : "local JSON";
  els.dataStatus.textContent = `${formatNumber(state.bills.length)} bills and ${formatNumber(state.rollCalls.length)} roll calls loaded - updated ${stamp} - build ${APP_VERSION}`;
}

function findBillForAlert(alert) {
  const rawId = String(alert.bill_id || "").toLowerCase();
  return state.bills.find((bill) => String(bill.id).toLowerCase() === rawId || bill.number.toLowerCase() === rawId);
}

function findAlertForBill(bill) {
  return state.alerts.find((alert) => {
    const rawId = String(alert.bill_id || "").toLowerCase();
    return rawId === String(bill.id).toLowerCase() || rawId === bill.number.toLowerCase();
  });
}

function classifyBucket(text) {
  const haystack = String(text || "").toLowerCase();
  const scored = policyBuckets
    .map((bucket) => ({
      name: bucket.name,
      score: bucket.keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].name : "Unbucketed";
}

function normalizeChamber(chamber, number) {
  const value = String(chamber || "").toLowerCase();
  if (value.includes("house")) return "House";
  if (value.includes("senate")) return "Senate";
  if (value.includes("joint")) return "Joint";
  if (String(number).startsWith("HB") || String(number).startsWith("HR")) return "House";
  if (String(number).startsWith("SB") || String(number).startsWith("SR")) return "Senate";
  return "Joint";
}

function progressIndex(bill) {
  const finalStatuses = ["4", "5", "6", "passed", "failed", "vetoed", "enacted", "dead"];
  if (finalStatuses.includes(String(bill.statusCode).toLowerCase()) || finalStatuses.includes(String(bill.statusLabel).toLowerCase())) return 4;
  const movement = `${bill.lastAction} ${bill.actions.map((item) => item.classification || item.description || "").join(" ")}`.toLowerCase();
  if (movement.includes("governor")) return 3;
  if (movement.includes("floor") || movement.includes("vote") || movement.includes("pass")) return 2;
  if (movement.includes("committee")) return 1;
  return 0;
}

function sortBills(a, b) {
  const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
  if (state.sort === "latest") {
    return dateValue(b.lastActionDate) - dateValue(a.lastActionDate) ||
      a.number.localeCompare(b.number, undefined, { numeric: true });
  }
  if (state.sort === "bill") {
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  }
  if (state.sort === "amendments") {
    return b.amendments.length - a.amendments.length ||
      dateValue(b.lastActionDate) - dateValue(a.lastActionDate);
  }
  if (state.sort === "texts") {
    return b.texts.length - a.texts.length ||
      dateValue(b.lastActionDate) - dateValue(a.lastActionDate);
  }
  if (state.sort === "status") {
    return a.statusLabel.localeCompare(b.statusLabel) ||
      a.number.localeCompare(b.number, undefined, { numeric: true });
  }
  return (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2) ||
    dateValue(b.lastActionDate) - dateValue(a.lastActionDate) ||
    a.number.localeCompare(b.number, undefined, { numeric: true });
}

function isReviewed(row) {
  const status = String(row.review_status || row.reviewStatus || row.status || "").toLowerCase();
  return ["reviewed", "complete", "done", "cleared"].includes(status);
}

function voteBucket(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("yea") || text === "yes" || text === "aye") return "Yea";
  if (text.includes("nay") || text === "no") return "Nay";
  return "Other";
}

function groupMemberVotes(votes) {
  return votes.reduce((groups, vote) => {
    groups[voteBucket(vote.vote_text)].push(vote);
    return groups;
  }, { Yea: [], Nay: [], Other: [] });
}

function personVoteBadges(personId) {
  const record = state.votesByPerson.get(String(personId));
  if (!record) {
    return `<span class="badge">0 votes</span>`;
  }
  return `
    <span class="badge">${formatNumber(record.counts.Yea)} yea</span>
    <span class="badge">${formatNumber(record.counts.Nay)} nay</span>
    <span class="badge">${formatNumber(record.counts.Other)} other</span>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
}

function workflowCard(icon, title, value, note) {
  return `
    <article class="workflow-card">
      <span class="card-icon"><i data-lucide="${escapeAttr(icon)}"></i></span>
      <div>
        <h3>${escapeHtml(title)}</h3>
        <strong>${formatNumber(value)}</strong>
      </div>
      <p class="subline">${escapeHtml(note)}</p>
    </article>
  `;
}

function compactBillRow(bill, text, date) {
  return `
    <div class="compact-row" data-bill-number="${escapeAttr(bill.number)}">
      <div class="chip-row">
        <strong>${escapeHtml(bill.number)}</strong>
        ${priorityPill(bill.priority)}
        <span class="badge">${escapeHtml(bill.statusLabel)}</span>
      </div>
      <div>${escapeHtml(bill.title)}</div>
      <div class="subline">${escapeHtml(date || "")} - ${escapeHtml(text || "")}</div>
    </div>
  `;
}

function sourceCard(title, lines, note) {
  return `
    <article class="source-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="compact-list">
        ${lines.map((line) => `<div>${line.includes("<a ") ? line : escapeHtml(line)}</div>`).join("")}
      </div>
      <p class="subline">${escapeHtml(note || "")}</p>
    </article>
  `;
}

function selectHtml(field, options, selected) {
  return `
    <select data-review-field="${escapeAttr(field)}">
      ${options.map((item) => optionHtml(item, labelize(item), item === selected)).join("")}
    </select>
  `;
}

function optionHtml(value, label, selected = false) {
  return `<option value="${escapeAttr(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function priorityPill(priority) {
  const value = priority || "normal";
  return `<span class="pill pill-${escapeAttr(value)}">${escapeHtml(labelize(value))}</span>`;
}

function stancePill(stance) {
  const value = stance || "unknown";
  return `<span class="pill pill-${escapeAttr(value)}">${escapeHtml(labelize(value))}</span>`;
}

function linkHtml(label, href) {
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function emptyState(message) {
  return `<div class="empty-state"><i data-lucide="inbox"></i><p>${escapeHtml(message)}</p></div>`;
}

async function fetchJson(path) {
  const separator = path.includes("?") ? "&" : "?";
  const cacheBust = `${APP_VERSION}-${Date.now()}`;
  const response = await fetch(`${path}${separator}v=${encodeURIComponent(cacheBust)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast("Draft copied"));
    return;
  }
  const box = document.querySelector("#contentDraft");
  if (box) {
    box.focus();
    box.select();
    document.execCommand("copy");
    showToast("Draft copied");
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function countBy(items) {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
}

function unique(items) {
  return [...new Set(items.filter((item) => item !== null && item !== undefined && item !== ""))];
}

function clean(value) {
  const next = String(value || "").trim();
  return next || "";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function dateValue(value) {
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? 0 : time;
}

function labelize(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function partyLabel(value) {
  const parties = { "0": "Nonpartisan", "1": "Democrat", "2": "Republican", "3": "Independent" };
  return parties[String(value ?? "")] || `Party ${value}`;
}

function roleLabel(value) {
  const roles = { Rep: "House", Sen: "Senate", Jnt: "Joint", H: "House", S: "Senate" };
  return roles[String(value || "")] || String(value || "");
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
