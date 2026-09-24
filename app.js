/* ---------------------------------------------------------
   Support Coach — front-end demo
   All "AI" here is a small mock analyzer so the UI is fully
   interactive with no backend. Swap `analyzeTurn()` for a
   real call to your Flask/FastAPI + WebSocket service that
   wraps the DistilBERT sentiment model + BART-MNLI intent
   model described in the project's technical architecture.
----------------------------------------------------------- */

const COMMON_ISSUES = [
  { label: "Recharge failed, money deducted", sample: "mera recharge nahi hua but paise cut gaye" },
  { label: "Refund still not received", sample: "bhai 2 din ho gaye, abhi tak refund nahi aaya" },
  { label: "Order has not arrived", sample: "bhai order abhi tak nahi aaya, bahut ganda service hai" },
  { label: "Internet / network down", sample: "my internet has stopped working since this morning" },
  { label: "Cannot log in", sample: "I can't log into my account, it keeps failing" },
  { label: "Threatening to cancel", sample: "fix this now or I'm cancelling my subscription" },
];

const NEGATIVE_WORDS = ["nahi", "ganda", "refund", "failed", "not received", "cut gaye", "stopped", "cancel", "threat", "angry", "worst"];
const HIGH_URGENCY_WORDS = ["cancel", "threat", "immediately", "now", "worst", "legal", "escalate"];

let state = {
  caseId: "SC-1040",
  calls: 1,
  turns: [
    { speaker: "customer", text: "bhai 2 din ho gaye, abhi tak refund nahi aaya" },
  ],
  lastAnalysis: null,
  speaker: "customer",
};

/* ---------------- Real analyzer (Flask backend) ---------------- */
const ANALYZE_URL = "http://127.0.0.1:5000/analyze";

async function analyzeTurn(text, speaker) {
  const res = await fetch(ANALYZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, speaker, caseId: state.caseId }),
  });
  if (!res.ok) throw new Error("Analysis request failed: " + res.status);
  return res.json();
}

/* ---------------- Console rendering ---------------- */
function renderConversation() {
  const el = document.getElementById("conversationScroll");
  el.innerHTML = "";
  state.turns.forEach((t) => {
    const div = document.createElement("div");
    div.className = "turn" + (t.speaker === "agent" ? " agent" : "");
    div.innerHTML = `<div class="turn-role">${t.speaker}</div><div class="turn-text"></div>`;
    div.querySelector(".turn-text").textContent = t.text;
    el.appendChild(div);
  });
  el.scrollTop = el.scrollHeight;
}

function renderCommonIssues() {
  const el = document.getElementById("commonIssues");
  el.innerHTML = "";
  COMMON_ISSUES.forEach((issue) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = issue.label;
    chip.onclick = () => {
      document.getElementById("turnInput").value = issue.sample;
    };
    el.appendChild(chip);
  });
}

function renderIntel(analysis) {
  const el = document.getElementById("intelScroll");
  if (!analysis) {
    el.innerHTML = `<div class="info-box"><div class="info-box-body" style="color:var(--muted)">Send a customer message to see live sentiment, urgency, and coaching suggestions.</div></div>`;
    return;
  }

  const urgencyClass = analysis.urgencyLevel.toLowerCase();
  const sentimentClass = analysis.sentiment.toLowerCase();

  el.innerHTML = `
    <div class="urgency-banner ${urgencyClass}">
      <div class="urgency-title ${urgencyClass}">${analysis.urgencyLevel}</div>
      <div class="urgency-desc">${analysis.urgencyLevel === "High"
      ? "Escalation likely — bring in a senior agent."
      : analysis.urgencyLevel === "Medium"
        ? "Frustration is building — acknowledge it now."
        : "Conversation is steady."
    } · ${analysis.score}/100</div>
    </div>

    <div class="mini-grid">
      <div class="mini-card">
        <div class="mini-label">Sentiment</div>
        <div class="mini-val ${sentimentClass}">${analysis.sentiment}</div>
      </div>
      <div class="mini-card">
        <div class="mini-label">Urgency</div>
        <div class="mini-val ${urgencyClass}">${analysis.urgencyLevel}</div>
      </div>
    </div>

    <div class="info-box">
      <div class="panel-label">Key issue</div>
      <div class="info-box-body">${analysis.keyIssue}</div>
    </div>

    <div class="info-box">
      <div class="panel-label">Agent scorecard</div>
      ${["Tone", "Empathy", "Clarity"]
      .map((label) => {
        const val = 5 + Math.floor(Math.random() * 4);
        return `<div class="scorecard-row"><div class="label">${label}</div><div class="track"><div class="fill" style="width:${val * 10}%"></div></div><div class="val">${val}/10</div></div>`;
      })
      .join("")}
    </div>

    <div class="coaching-tip">${analysis.coachingTip}</div>

    ${analysis.suggestedReply
      ? `<div class="info-box">
            <div class="panel-label">Suggested reply ${analysis.groundedInArticle
        ? `<span class="badge low">Grounded: ${analysis.articleTitle}</span>`
        : `<span class="badge medium">No article match</span>`
      }</div>
            <div class="suggested-reply-body"></div>
            <div class="suggest-actions">
              <button class="btn">Copy</button>
              <button class="btn btn-primary">Use this reply</button>
            </div>
          </div>`
      : ""
    }
  `;

  if (analysis.suggestedReply) {
    el.querySelector(".suggested-reply-body").textContent = analysis.suggestedReply;
  }
}

async function submitTurn() {
  const input = document.getElementById("turnInput");
  const text = input.value.trim();
  if (!text) return;

  state.turns.push({ speaker: state.speaker, text });
  renderConversation();
  input.value = "";

  document.getElementById("statusPill").innerHTML = `<span class="dot"></span>analysing…`;
  document.getElementById("latencyOut").textContent = "…";
  const startedAt = performance.now();

  try {
    const analysis = await analyzeTurn(text, state.speaker);
    state.lastAnalysis = analysis;
    renderIntel(analysis);
    document.getElementById("statusPill").innerHTML = `<span class="dot"></span>live`;
    document.getElementById("latencyOut").textContent = Math.round(performance.now() - startedAt) + " ms";
    state.calls += 1;
    document.getElementById("callsOut").textContent = state.calls;
  } catch (err) {
    document.getElementById("statusPill").innerHTML = `<span class="dot" style="background:#d6453c"></span>offline`;
    document.getElementById("intelScroll").innerHTML =
      `<div class="info-box"><div class="info-box-body" style="color:var(--negative)">Couldn't reach the analysis backend at ${ANALYZE_URL}. Make sure <code>python app.py</code> is running in the backend folder.</div></div>`;
  }
}

/* ---------------- Dashboard: real case data from the backend ---------------- */
const CASES_URL = "http://127.0.0.1:5000/cases";

async function renderCaseTable() {
  const body = document.getElementById("caseTableBody");
  body.innerHTML = `<tr><td colspan="8" style="color:var(--muted)">Loading cases…</td></tr>`;

  let cases = [];
  try {
    const res = await fetch(CASES_URL);
    cases = await res.json();
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" style="color:var(--negative)">Couldn't reach ${CASES_URL} — make sure the backend is running.</td></tr>`;
    return;
  }

  if (cases.length === 0) {
    body.innerHTML = `<tr><td colspan="8" style="color:var(--muted)">No cases yet — send a message in the Console tab first.</td></tr>`;
    return;
  }

  body.innerHTML = cases
    .map(
      (c) => `
    <tr>
      <td><b>${c.id}</b></td>
      <td>${c.issue}</td>
      <td><span class="tag ${c.risk}">${c.risk}</span></td>
      <td><span class="tag ${c.sentiment}">${c.sentiment}</span></td>
      <td>${c.turns}</td>
      <td>${c.sla}</td>
      <td><span class="tag ${c.status}">${c.status}</span></td>
      <td>${new Date(c.opened).toLocaleString()}</td>
    </tr>`
    )
    .join("");
}

function renderFilters() {
  const el = document.getElementById("filterRow");
  const groups = [
    { name: "Status", opts: ["All", "Pending", "Resolved", "Auto"] },
    { name: "Risk", opts: ["All", "Low", "Medium", "High"] },
    { name: "Sentiment", opts: ["All", "Positive", "Neutral", "Negative"] },
  ];
  el.innerHTML = groups
    .map(
      (g) => `<div class="filter-group">${g.name}
      ${g.opts.map((o, i) => `<span class="opt${i === 0 ? " active" : ""}">${o}</span>`).join("")}
    </div>`
    )
    .join("");
  el.querySelectorAll(".opt").forEach((opt) => {
    opt.onclick = () => {
      opt.parentElement.querySelectorAll(".opt").forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
    };
  });
}

const STATS_URL = "http://127.0.0.1:5000/stats";

function barRow(label, val, max, cls) {
  const pct = max > 0 ? (val / max) * 100 : 0;
  return `<div class="bar-row"><div class="label">${label}</div><div class="track"><div class="fill ${cls}" style="width:${pct}%"></div></div><div class="val">${val}</div></div>`;
}

async function renderResolutionBars() {
  let s;
  try {
    s = await (await fetch(STATS_URL)).json();
  } catch (err) {
    document.getElementById("resolutionBars").innerHTML = `<div style="color:var(--negative)">Backend unreachable.</div>`;
    return;
  }
  document.getElementById("resolvedPct").textContent = `${s.resolvedPct}% closed (${s.resolved}/${s.totalCases})`;
  const max = Math.max(s.riskCounts.low, s.riskCounts.medium, s.riskCounts.high, 1);
  document.getElementById("resolutionBars").innerHTML =
    barRow("Low", s.riskCounts.low, max, "low") +
    barRow("Medium", s.riskCounts.medium, max, "medium") +
    barRow("High", s.riskCounts.high, max, "high");
}

async function renderSentimentBars() {
  let s;
  try {
    s = await (await fetch(STATS_URL)).json();
  } catch (err) {
    document.getElementById("sentimentBars").innerHTML = `<div style="color:var(--negative)">Backend unreachable.</div>`;
    return;
  }
  const max = Math.max(s.sentimentCounts.positive, s.sentimentCounts.neutral, s.sentimentCounts.negative, 1);
  document.getElementById("sentimentBars").innerHTML =
    barRow("Positive", s.sentimentCounts.positive, max, "positive") +
    barRow("Neutral", s.sentimentCounts.neutral, max, "neutral") +
    barRow("Negative", s.sentimentCounts.negative, max, "negative");
  document.getElementById("avgTurns").textContent = s.avgTurns;
  document.getElementById("apiCalls").textContent = s.apiCalls;
}

function renderScoreCards() {
  const cards = [
    { label: "Tone", val: "4.25", trend: "+1.84" },
    { label: "Empathy", val: "3.33", trend: "+2" },
    { label: "Clarity", val: "4.5", trend: "+1.34" },
  ];
  document.getElementById("scoreCards").innerHTML = cards
    .map(
      (c) =>
        `<div class="score-card"><div class="lbl">${c.label}</div><div class="num">${c.val}</div><div class="trend">↑ ${c.trend} improving</div></div>`
    )
    .join("");
}

function renderCoachTips() {
  const tips = [
    { cnt: "7x", head: "Be specific, not generic", body: "Include a specific acknowledgment of the customer's wait time in the apology to push the empathy score higher." },
    { cnt: "5x", head: "Acknowledge the problem first", body: "Instead of asking the customer to wait without context, acknowledge the concern and give a clear next step." },
  ];
  document.getElementById("coachTips").innerHTML = tips
    .map((t) => `<div class="tip-row"><div class="cnt">${t.cnt}</div><div class="head">${t.head}</div><div class="body">${t.body}</div></div>`)
    .join("");
}

function renderAcceptRate() {
  document.getElementById("acceptRate").innerHTML = `
    <div class="big">0%</div>
    <div class="sub">overall · 0 useful, 1 not — 1 of 15 suggestions rated</div>
    <div class="bar-row"><div class="label">With article</div><div class="track"><div class="fill negative" style="width:2%"></div></div><div class="val">0%</div></div>
    <div class="bar-row"><div class="label">No article</div><div class="track"><div class="fill medium" style="width:100%"></div></div><div class="val">–</div></div>
  `;
}

let issuesChart;
function renderIssuesChart() {
  const ctx = document.getElementById("issuesChart");
  if (issuesChart) issuesChart.destroy();
  issuesChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["1 Sept", "4 Sept", "7 Sept", "10 Sept", "13 Sept", "15 Sept"],
      datasets: [
        { label: "Resolved", data: [6, 4, 0, 0, 0, 0], backgroundColor: "#1a8f5a" },
        { label: "Pending", data: [5, 2, 15, 0, 0, 8], backgroundColor: "#e0562e" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: "#f0eee6" } },
      },
    },
  });
}

/* ---------------- View switching ---------------- */
function switchView(view) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.getElementById("view-console").classList.toggle("hidden", view !== "console");
  document.getElementById("view-dashboard").classList.toggle("hidden", view !== "dashboard");
  document.getElementById("viewLabel").textContent = view === "console" ? "LIVE CONSOLE" : "DASHBOARD";
  if (view === "dashboard") {
    renderIssuesChart();
    renderCaseTable();
    renderResolutionBars();
    renderSentimentBars();
  }
}

/* ---------------- Wire up ---------------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.onclick = () => switchView(btn.dataset.view);
});

document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.speaker = btn.dataset.speaker;
    document.getElementById("composerHint").textContent =
      state.speaker === "agent" ? "scores your reply and redrafts it" : "analyses, looks up and drafts a reply";
    document.getElementById("turnInput").placeholder =
      state.speaker === "agent" ? "Type the agent's reply…" : "Type what the customer just said…";
  };
});

document.getElementById("sendBtn").onclick = submitTurn;
document.getElementById("turnInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitTurn();
});

document.getElementById("loadDemoBtn").onclick = () => {
  state.turns = [{ speaker: "customer", text: "bhai 2 din ho gaye, abhi tak refund nahi aaya" }];
  state.calls = 1;
  renderConversation();
  renderIntel(null);
  document.getElementById("callsOut").textContent = state.calls;
};

document.getElementById("newCaseBtn").onclick = () => {
  const n = 1041 + Math.floor(Math.random() * 20);
  state.caseId = "SC-" + n;
  state.turns = [];
  document.getElementById("caseIdOut").textContent = state.caseId;
  renderConversation();
  renderIntel(null);
};

document.getElementById("resolveBtn").onclick = async () => {
  try {
    await fetch(`http://127.0.0.1:5000/cases/${state.caseId}/resolve`, { method: "POST" });
    document.getElementById("statusPill").innerHTML = `<span class="dot" style="background:#b7b4a9"></span>resolved`;
  } catch (err) {
    document.getElementById("statusPill").innerHTML = `<span class="dot" style="background:#d6453c"></span>offline`;
  }
};

/* ---------------- Init ---------------- */
renderConversation();
renderCommonIssues();
renderIntel(null);
renderCaseTable();
renderFilters();
renderResolutionBars();
renderSentimentBars();
renderScoreCards();
renderCoachTips();
renderAcceptRate();