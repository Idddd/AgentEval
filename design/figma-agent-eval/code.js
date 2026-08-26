/* AgentEval Full UI Generator
 * Runs entirely inside Figma. It creates an editable design system and the
 * complete product surface inventory from the AgentEval demo application.
 */

const FILE_PREFIX = "AgentEval";
const SCREEN_W = 1440;
const SCREEN_H = 1024;
const PAGE_GAP = 160;

const C = {
  bg: "#FAFAFA", fg: "#191A1B", card: "#FFFFFF", primary: "#4339FF",
  primarySoft: "#F0EFFF", muted: "#F2F2F2", mutedFg: "#6F7072",
  border: "#E6E6E7", input: "#CDCECE", success: "#16835A",
  successSoft: "#EAF8F1", warning: "#D97706", warningSoft: "#FFF7E8",
  danger: "#DC2626", dangerSoft: "#FFF0F0", info: "#2563EB",
  infoSoft: "#EEF5FF", cyan: "#008CA3", purple: "#8B5CF6",
  sidebar: "#FAFAFA", darkBg: "#252525", darkCard: "#343434",
  darkFg: "#FAFAFA", darkMuted: "#A3A3A3"
};

const PAGE_SPECS = [
  ["03 Build", [
    ["Build / Agent catalog", "catalog"],
    ["Build / Onboarding Assistant first", "catalog-onboarding"],
    ["Build / Agent detail", "build-detail"],
    ["Build / Agent edit", "build-edit"],
    ["Build / Create Agent", "build-create"],
    ["Build / MCP Server catalog", "resource-catalog"],
    ["Build / MCP Server detail", "resource-detail"],
    ["Build / Skill catalog", "resource-catalog"],
    ["Build / Skill detail", "resource-detail"],
    ["Build / Knowledge Base catalog", "resource-catalog"]
  ]],
  ["04 Evaluate", [
    ["Evaluate / Lifecycle catalog", "lifecycle"],
    ["Evaluate / Action required filter", "lifecycle-filter"],
    ["Evaluate / Agent evaluation workspace", "wizard"],
    ["Evaluate / Dataset setup", "dataset"],
    ["Evaluate / Create dataset dialog", "dataset-dialog"],
    ["Evaluate / Running evaluation", "run"],
    ["Evaluate / Completed report preview", "report-preview"],
    ["Evaluate / Full report detail", "report"],
    ["Evaluate / Test case results", "testcases"]
  ]],
  ["05 Business Eval", [
    ["Business Eval / Pending approval", "business-pending"],
    ["Business Eval / Failed report", "business-failed"],
    ["Business Eval / Passed report", "business-passed"],
    ["Business Eval / Reject reason optional", "business-reject"],
    ["Business Eval / Approved and published", "business-published"]
  ]],
  ["06 Guardrails", [
    ["Guardrails / Registry", "guard-catalog"],
    ["Guardrails / Policy Library", "guard-library"],
    ["Guardrails / Policy Studio", "guard-studio"],
    ["Guardrails / Compliance document import", "guard-import"],
    ["Guardrails / Policy binding editor", "guard-binding"],
    ["Guardrails / Detail", "guard-detail"],
    ["Guardrails / Create flow", "guard-create"],
    ["Guardrails / Assignment sheet", "guard-sheet"],
    ["Guardrails / Traffic scope", "guard-scope"],
    ["Guardrails / Enforcements", "guard-table"],
    ["Guardrails / Evidence", "guard-table"],
    ["Guardrails / Integrations", "integration"],
    ["Guardrails / Relay preview", "relay"]
  ]],
  ["07 Monitor", [
    ["Monitor / All traces", "monitor"],
    ["Monitor / Failure filter", "monitor-fail"],
    ["Monitor / Evaluator policy 2 active", "evaluators-2"],
    ["Monitor / Evaluator policy 10 active", "evaluators-10"],
    ["Monitor / Trace detail", "trace-detail"]
  ]],
  ["08 Agent Garden", [
    ["Agent Garden / Approved catalog", "garden"],
    ["Agent Garden / Search results", "garden-search"],
    ["Agent Garden / Agent detail", "garden-detail"],
    ["Agent Garden / Apply Instance", "garden-apply"]
  ]],
  ["09 Instances", [
    ["Instances / List", "instances"],
    ["Instances / Creating", "instances-creating"],
    ["Instances / Ready", "instances-ready"],
    ["Instance / OpenClaw detail", "instance-detail"],
    ["Instance / Endpoint and credentials", "instance-endpoint"]
  ]],
  ["10 Secondary & System", [
    ["Login", "login"],
    ["Access Policies", "generic-table"],
    ["Access Policy detail", "generic-detail"],
    ["Audit Logs", "generic-table"],
    ["Audit Log detail", "generic-detail"],
    ["Model Cost", "cost"],
    ["Runtime", "generic-table"],
    ["Runtime Policies", "generic-table"],
    ["Memory", "generic-table"],
    ["Requests", "generic-table"],
    ["Project Settings", "settings"],
    ["Profile", "settings"],
    ["Empty state", "empty"],
    ["Error state", "error"],
    ["Loading state", "loading"]
  ]],
  ["99 Legacy Reference", [
    ["Legacy / Evaluations list", "generic-table"],
    ["Legacy / Evaluation setup", "wizard"],
    ["Legacy / Dataset detail", "dataset"],
    ["Legacy / Report comparison", "report"],
    ["Legacy / Trace workbench", "trace-detail"]
  ]]
];

let FONT_REGULAR;
let FONT_MEDIUM;
let FONT_BOLD;

function rgb(hex) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

function paint(hex, opacity = 1) { return { type: "SOLID", color: rgb(hex), opacity }; }
function fill(node, hex, opacity = 1) { node.fills = [paint(hex, opacity)]; }
function stroke(node, hex = C.border, weight = 1) { node.strokes = [paint(hex)]; node.strokeWeight = weight; }

function text(value, size = 14, color = C.fg, weight = "regular", name) {
  const n = figma.createText();
  n.fontName = weight === "bold" ? FONT_BOLD : weight === "medium" ? FONT_MEDIUM : FONT_REGULAR;
  n.characters = value;
  n.fontSize = size;
  n.lineHeight = { unit: "PIXELS", value: Math.round(size * 1.45) };
  n.fills = [paint(color)];
  if (name) n.name = name;
  return n;
}

function frame(name, direction = "VERTICAL", gap = 0, padding = 0) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = direction;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "AUTO";
  f.itemSpacing = gap;
  f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = padding;
  f.fills = [];
  f.clipsContent = false;
  return f;
}

function fixed(f, w, h) { f.resize(w, h); f.primaryAxisSizingMode = "FIXED"; f.counterAxisSizingMode = "FIXED"; return f; }
function grow(n) { n.layoutGrow = 1; return n; }
function hug(n) { n.layoutAlign = "INHERIT"; return n; }

function vstack(name, gap = 12, padding = 0) { return frame(name, "VERTICAL", gap, padding); }
function hstack(name, gap = 12, padding = 0) { const f = frame(name, "HORIZONTAL", gap, padding); f.counterAxisAlignItems = "CENTER"; return f; }

function card(name = "Card", padding = 20, gap = 12) {
  const f = vstack(name, gap, padding);
  fill(f, C.card); stroke(f); f.cornerRadius = 8;
  return f;
}

function divider(w) { const d = figma.createRectangle(); d.name = "Divider"; d.resize(w, 1); fill(d, C.border); return d; }

function pill(label, tone = "neutral") {
  const tones = {
    neutral: [C.muted, C.fg], primary: [C.primarySoft, C.primary], success: [C.successSoft, C.success],
    warning: [C.warningSoft, C.warning], danger: [C.dangerSoft, C.danger], info: [C.infoSoft, C.info]
  };
  const [bg, fg] = tones[tone] || tones.neutral;
  const p = hstack(`Badge / ${label}`, 4, 0);
  p.paddingLeft = p.paddingRight = 8; p.paddingTop = p.paddingBottom = 4;
  p.cornerRadius = 4; fill(p, bg); p.appendChild(text(label, 11, fg, "medium"));
  return p;
}

function button(label, variant = "primary", width) {
  const b = hstack(`Button / ${label}`, 8, 0);
  b.paddingLeft = b.paddingRight = 14; b.paddingTop = b.paddingBottom = 9; b.cornerRadius = 6;
  const primary = variant === "primary";
  fill(b, primary ? C.primary : C.card);
  if (!primary) stroke(b);
  b.appendChild(text(label, 13, primary ? "#FFFFFF" : C.fg, "medium"));
  if (width) { b.resize(width, 38); b.primaryAxisSizingMode = "FIXED"; b.primaryAxisAlignItems = "CENTER"; }
  return b;
}

function input(label, placeholder, width = 280, tall = false) {
  const wrap = vstack(`Field / ${label}`, 6);
  wrap.appendChild(text(label, 12, C.fg, "medium"));
  const box = hstack("Input", 8, 12);
  fixed(box, width, tall ? 82 : 40); box.cornerRadius = 6; fill(box, C.card); stroke(box, C.input);
  const t = text(placeholder, 13, C.mutedFg); t.layoutGrow = 1; t.textAutoResize = "HEIGHT"; box.appendChild(t);
  wrap.appendChild(box);
  return wrap;
}

function stat(label, value, tone = "neutral") {
  const s = card(`Stat / ${label}`, 16, 8); fixed(s, 220, 92);
  s.appendChild(text(label.toUpperCase(), 10, C.mutedFg, "medium"));
  s.appendChild(text(value, 24, tone === "danger" ? C.danger : tone === "success" ? C.success : tone === "warning" ? C.warning : C.fg, "bold"));
  return s;
}

function iconBox(letter, tone = C.primary) {
  const box = hstack(`Icon / ${letter}`, 0, 0); fixed(box, 34, 34); box.cornerRadius = 8; fill(box, tone, .10);
  box.primaryAxisAlignItems = "CENTER"; box.counterAxisAlignItems = "CENTER"; box.appendChild(text(letter, 15, tone, "bold"));
  return box;
}

function navItem(label, active = false) {
  const item = hstack(`Nav / ${label}`, 10, 10); fixed(item, 196, 40); item.cornerRadius = 6;
  fill(item, active ? C.primarySoft : C.sidebar);
  item.appendChild(iconBox(label.slice(0, 1), active ? C.primary : C.mutedFg));
  item.appendChild(text(label, 13, active ? C.primary : C.fg, active ? "medium" : "regular"));
  return item;
}

function sidebar(active) {
  const s = vstack("App Sidebar", 6, 16); fixed(s, 228, SCREEN_H); fill(s, C.sidebar); stroke(s);
  const brand = hstack("Brand", 10, 0); fixed(brand, 196, 48);
  brand.appendChild(iconBox("T", C.cyan));
  const brandWords = vstack("Brand name", 0); brandWords.appendChild(text("TALI", 15, C.fg, "bold")); brandWords.appendChild(text("TaskLattice", 9, C.mutedFg)); brand.appendChild(brandWords); s.appendChild(brand);
  const project = card("Project switcher", 10, 4); fixed(project, 196, 48); project.appendChild(text("Demo Project", 13, C.fg, "medium")); s.appendChild(project);
  s.appendChild(text("WORKSPACE", 9, C.mutedFg, "medium"));
  const navs = active === "end" ? ["Agent Garden", "My Instances"] : active === "admin" ? ["Eval", "Guardrails", "Monitor"] : ["Build", "Evaluate", "Agent Garden"];
  navs.forEach((n, i) => s.appendChild(navItem(n, i === 0)));
  const spacer = frame("Flexible space"); spacer.layoutGrow = 1; spacer.layoutAlign = "STRETCH"; s.appendChild(spacer);
  s.appendChild(navItem("Help & documentation"));
  s.appendChild(divider(196));
  const user = hstack("Current user", 10, 0); user.appendChild(iconBox(active === "admin" ? "LA" : "U"));
  const words = vstack("User name", 1); words.appendChild(text(active === "admin" ? "Local Administrator" : "Demo User", 12, C.fg, "medium")); words.appendChild(text(active === "admin" ? "Admin" : "Local account", 10, C.mutedFg)); user.appendChild(words); s.appendChild(user);
  return s;
}

function topbar(crumb) {
  const t = hstack("Top bar", 12, 24); fixed(t, SCREEN_W - 228, 64); fill(t, C.bg); stroke(t);
  const c = text(`Demo Project  /  ${crumb}`, 12, C.fg, "medium"); c.layoutGrow = 1; t.appendChild(c);
  const search = hstack("Project search", 8, 12); fixed(search, 250, 36); search.cornerRadius = 6; fill(search, C.card); stroke(search); search.appendChild(text("⌕  Search project", 12, C.mutedFg)); t.appendChild(search);
  return t;
}

function sectionTitle(titleValue, subtitle, action) {
  const row = hstack("Page heading", 16, 0); row.layoutAlign = "STRETCH";
  const words = vstack("Title", 5); words.layoutGrow = 1; words.appendChild(text(titleValue, 28, C.fg, "bold")); words.appendChild(text(subtitle, 13, C.mutedFg)); row.appendChild(words);
  if (action) row.appendChild(button(action));
  return row;
}

function agentCard(name, status = "Running", description = "Handles business requests with permission-aware tools.") {
  const a = card(`Agent card / ${name}`, 18, 14); fixed(a, 468, 190);
  const head = hstack("Agent heading", 10, 0); const words = vstack("Name", 4); words.layoutGrow = 1; words.appendChild(text(name, 17, C.fg, "medium")); words.appendChild(text(description, 12, C.mutedFg)); head.appendChild(words); head.appendChild(pill(status, status === "Failed" ? "danger" : status === "Completed" ? "success" : "primary")); a.appendChild(head);
  const facts = hstack("Facts", 48, 0); ["Revision\nR1", "Runtime\npermission-compliance", "Tools\n3 configured"].forEach(v => { const [l, x] = v.split("\n"); const f = vstack(l, 3); f.appendChild(text(l, 10, C.mutedFg)); f.appendChild(text(x, 12, C.fg, "medium")); facts.appendChild(f); }); a.appendChild(facts);
  return a;
}

function dataTable(titleValue, columns, rows, width = 920) {
  const t = card(`Table / ${titleValue}`, 0, 0); fixed(t, width, 56 + rows.length * 50);
  const heading = hstack("Table title", 12, 16); fixed(heading, width, 54); heading.appendChild(text(titleValue, 15, C.fg, "medium")); t.appendChild(heading);
  const header = hstack("Header", 0, 12); fixed(header, width, 36); fill(header, C.muted);
  columns.forEach(c => { const tx = text(c, 10, C.mutedFg, "medium"); tx.resize((width - 24) / columns.length, 18); tx.textAutoResize = "NONE"; header.appendChild(tx); }); t.appendChild(header);
  rows.forEach((row, ri) => { const r = hstack(`Row ${ri + 1}`, 0, 12); fixed(r, width, 50); if (ri % 2) fill(r, "#FCFCFC"); row.forEach((v, ci) => { const tx = text(v, 11, ci === 0 ? C.fg : C.mutedFg, ci === 0 ? "medium" : "regular"); tx.resize((width - 24) / columns.length, 32); tx.textAutoResize = "NONE"; r.appendChild(tx); }); t.appendChild(r); });
  return t;
}

function lifecycleRow(name, state = "Not started") {
  const r = card(`Lifecycle / ${name}`, 14, 0); fixed(r, 1020, 78); r.layoutMode = "HORIZONTAL"; r.counterAxisAlignItems = "CENTER"; r.itemSpacing = 24;
  const agent = hstack("Agent", 10, 0); fixed(agent, 260, 48); agent.appendChild(iconBox(name.slice(0, 1), C.cyan)); const aw = vstack("Agent words", 1); aw.appendChild(text(name, 14, C.fg, "medium")); aw.appendChild(text("Agent · R1", 10, C.mutedFg)); agent.appendChild(aw); r.appendChild(agent);
  ["REVISION\nR1", "DATASET\nDemo Default Dataset", "EVALUATION\n" + state, "RESULT\nNot evaluated"].forEach((v, i) => { const [l, x] = v.split("\n"); const f = vstack(l, 3); fixed(f, i === 1 ? 200 : 150, 44); f.appendChild(text("●  " + l, 9, i < 2 ? C.success : C.mutedFg, "medium")); f.appendChild(text(x, 11, C.fg, "medium")); r.appendChild(f); });
  return r;
}

function evaluatorCard(name, score = "80", alert = false) {
  const e = card(`Evaluator / ${name}`, 12, 10); fixed(e, 222, 112);
  const head = hstack("Evaluator heading", 8, 0); const n = text(name, 12, C.fg, "medium"); n.layoutGrow = 1; head.appendChild(n); head.appendChild(pill("Enabled", "success")); e.appendChild(head);
  e.appendChild(text("Built-in · demo-v1", 10, C.mutedFg));
  const controls = hstack("Controls", 8, 0); controls.appendChild(pill(`Pass ${score}%`, "primary")); controls.appendChild(pill(alert ? "Alert on fail" : "No alert", alert ? "warning" : "neutral")); e.appendChild(controls);
  return e;
}

function reportPanel(status = "FAILED", full = true) {
  const tone = status === "PASSED" ? "success" : "danger";
  const p = card("Evaluation report", 0, 0); fixed(p, full ? 720 : 610, full ? 520 : 410);
  const h = hstack("Report header", 12, 16); fixed(h, full ? 720 : 610, 64); fill(h, tone === "success" ? C.successSoft : C.dangerSoft); h.appendChild(iconBox(status === "PASSED" ? "✓" : "!", tone === "success" ? C.success : C.danger)); const w = vstack("Report title", 1); w.layoutGrow = 1; w.appendChild(text("Evaluation report", 15, C.fg, "medium")); w.appendChild(text(status === "PASSED" ? "Passed" : "Needs attention", 10, C.mutedFg)); h.appendChild(w); h.appendChild(pill(status, tone)); p.appendChild(h);
  const rows = [
    ["Test result", status === "PASSED" ? "92% pass rate · 8 evaluated" : "68% pass rate · 8 evaluated"],
    ["Required pass rate", "85%"], ["Business dataset", "Customer Support Readiness"],
    ["Safety checks", "Universal Safety Baseline · R1"], ["Residual risk", status === "PASSED" ? "Low" : "High"],
    ["Actual cost", "$0.04"], ["Completed", "2026/8/1 17:00:00"],
    ["Recommendation", status === "PASSED" ? "Evidence supports a controlled business rollout." : "The failed Eval requires an explicit Admin risk decision."]
  ];
  rows.forEach(([l, v]) => { const r = hstack(`Report row / ${l}`, 16, 12); fixed(r, full ? 720 : 610, 42); const label = text(l, 10, C.mutedFg); label.resize(120, 18); label.textAutoResize = "NONE"; r.appendChild(label); const val = text(v, 11, C.fg, "medium"); val.layoutGrow = 1; r.appendChild(val); p.appendChild(r); });
  return p;
}

function pageBody(screenName, type) {
  const body = vstack("Page content", 20, 24); fixed(body, SCREEN_W - 228, SCREEN_H - 64); fill(body, C.bg);
  const titleMap = type.startsWith("business") ? ["Business Eval", "Evaluate outcomes, safety coverage, and approval readiness."]
    : type.startsWith("guard") || type === "integration" || type === "relay" ? ["Guardrails", "Define, assign, and inspect governance controls."]
    : type.startsWith("monitor") || type.startsWith("evaluators") || type === "trace-detail" ? ["Production Monitor", "Inspect live Agent traffic, evaluator outcomes, latency, and cost."]
    : type.startsWith("garden") ? ["Agent Garden", "Choose an approved business capability and apply an Instance."]
    : type.startsWith("instance") || type === "instances" ? ["My Instances", "Continue approved work and manage your Instances."]
    : type === "login" ? ["Welcome back", "Sign in to continue to TaskLattice."]
    : type.includes("lifecycle") || ["wizard","dataset","dataset-dialog","run","report-preview","report","testcases"].includes(type) ? ["Evaluate", "Test the exact Build revision and review immutable evidence."]
    : [screenName.split(" / ")[0], "Create technical resources and manage immutable revisions."];
  if (type !== "login") body.appendChild(sectionTitle(titleMap[0], titleMap[1], type.startsWith("garden") ? null : type.includes("catalog") ? "+ Create" : null));

  if (type === "catalog" || type === "catalog-onboarding") buildCatalog(body, type === "catalog-onboarding");
  else if (type === "build-detail" || type === "build-edit" || type === "build-create") buildDetail(body, type);
  else if (type === "resource-catalog") resourceCatalog(body);
  else if (type === "resource-detail") resourceDetail(body);
  else if (type === "lifecycle" || type === "lifecycle-filter") lifecycle(body, type === "lifecycle-filter");
  else if (["wizard","dataset","dataset-dialog","run"].includes(type)) evaluationWorkspace(body, type);
  else if (["report-preview","report","testcases"].includes(type)) evaluationReport(body, type);
  else if (type.startsWith("business")) businessEval(body, type);
  else if (type.startsWith("guard") || type === "integration" || type === "relay") guardrail(body, type);
  else if (type.startsWith("monitor") || type.startsWith("evaluators") || type === "trace-detail") monitor(body, type);
  else if (type.startsWith("garden")) garden(body, type);
  else if (type.startsWith("instance") || type === "instances") instances(body, type);
  else if (type === "login") login(body);
  else if (type === "cost") cost(body);
  else if (type === "settings") settings(body);
  else if (["empty","error","loading"].includes(type)) systemState(body, type);
  else if (type === "generic-detail") genericDetail(body, screenName);
  else genericTable(body, screenName);
  return body;
}

function buildCatalog(body, onboardingFirst) {
  const tabs = hstack("Resource tabs", 8, 6); ["Agent", "MCP Server", "Skill", "Knowledge Base"].forEach((n,i)=>tabs.appendChild(pill(n, i===0?"primary":"neutral"))); body.appendChild(tabs);
  const actions = hstack("Section actions", 12, 0); actions.layoutAlign = "STRETCH"; const words=vstack("Agents",3); words.layoutGrow=1; words.appendChild(text("Agents",20,C.fg,"bold")); words.appendChild(text("Build an Agent here, then continue to Evaluate when it is ready.",12,C.mutedFg)); actions.appendChild(words); actions.appendChild(button("+ Create Agent","secondary")); actions.appendChild(button("Continue to Evaluate →")); body.appendChild(actions);
  const grid = hstack("Agent grid", 14, 0); grid.layoutWrap = "WRAP"; grid.layoutAlign = "STRETCH";
  const names = onboardingFirst ? ["Onboarding Assistant","Office Assistant","Customer Service","Deployment Monitor","Sample Security Assistant"] : ["Office Assistant","Customer Service","Onboarding Assistant","Deployment Monitor","Sample Security Assistant"];
  names.forEach((n,i)=>grid.appendChild(agentCard(n,i===1?"Failed":i===3?"Running":"Completed",n==="Onboarding Assistant"?"New Agent awaiting its first evaluation.":undefined))); body.appendChild(grid);
}

function buildDetail(body, type) {
  const wrap = hstack("Build detail layout", 20, 0); wrap.layoutAlign = "STRETCH";
  const summary = card("Agent summary",20,16); fixed(summary,340,720); summary.appendChild(iconBox("OA",C.cyan)); summary.appendChild(text(type==="build-create"?"New Agent":"Office Assistant",22,C.fg,"bold")); summary.appendChild(text("Handles everyday office requests while checking role-based permissions before every tool call.",12,C.mutedFg)); summary.appendChild(pill(type==="build-create"?"Draft":"Current R2",type==="build-create"?"neutral":"success")); ["Owner · Platform Operations","Runtime · permission-compliance","Revision · R2"].forEach(v=>summary.appendChild(text(v,12,C.fg,"medium"))); wrap.appendChild(summary);
  const form = card(type==="build-detail"?"Build configuration":"Edit build",22,18); fixed(form,760,720); form.appendChild(sectionTitle(type==="build-create"?"Create Agent":type==="build-edit"?"Edit Agent":"Build details","Resources are captured at creation and versioned with this build.")); form.appendChild(input("Name",type==="build-create"?"New Agent":"Office Assistant",700)); form.appendChild(input("Description","Describe the business capability and operating boundary.",700,true));
  const resources = vstack("Connected resources",10); resources.appendChild(text("Connected resources",14,C.fg,"medium")); ["Web Search","Company Directory","Workflow Automation"].forEach(n=>resources.appendChild(pill(n,"primary"))); form.appendChild(resources);
  form.appendChild(input("System instructions","Respond within the approved business scope and verify authorization before tool use.",700,true)); const actions=hstack("Form actions",10,0); actions.primaryAxisAlignItems="MAX"; actions.appendChild(button("Cancel","secondary")); actions.appendChild(button(type==="build-create"?"Create Agent":"Save new revision")); form.appendChild(actions); wrap.appendChild(form); body.appendChild(wrap);
}

function resourceCatalog(body) { const grid=hstack("Resource grid",14,0); grid.layoutWrap="WRAP"; ["Company Directory","Permission Compliance","Web Search","Workflow Automation","Universal Safety Baseline","Customer Support Readiness"].forEach((n,i)=>{const c=card(`Resource / ${n}`,18,12);fixed(c,320,170);c.appendChild(iconBox(n.slice(0,1),i%2?C.purple:C.info));c.appendChild(text(n,16,C.fg,"medium"));c.appendChild(text("Reusable resource attached when an Agent build is created.",12,C.mutedFg));c.appendChild(pill(i%3===0?"Connected":"Available",i%3===0?"success":"neutral"));grid.appendChild(c);});body.appendChild(grid); }
function resourceDetail(body) { const d=card("Resource detail",24,18);fixed(d,980,650);d.appendChild(sectionTitle("Permission Compliance","MCP Server · Stable R2","Clone"));d.appendChild(dataTable("Configuration",["Property","Value"],[["Endpoint","mcp://permission-compliance"],["Authentication","Project service identity"],["Tools","CheckPermission, ListScopes, ExplainDecision"],["Used by","Office Assistant · R2"],["Created","2026/08/01 09:00"]],920));body.appendChild(d); }

function lifecycle(body, filtered) {
  const stats=hstack("Lifecycle stats",12,0); [["Action required",filtered?"18":"18","danger"],["In progress","1","primary"],["Waiting for Admin","14","warning"],["Approved","5","success"]].forEach(v=>stats.appendChild(stat(v[0],v[1],v[2])));body.appendChild(stats);
  const filters=card("Filters",12,12);fixed(filters,1080,104);const row=hstack("Filter row",14,0);["All 33","Not evaluated 17","Running 1","Completed 13","Failed 1","Needs re-evaluation 1"].forEach((n,i)=>row.appendChild(pill(n,filtered&&i===0?"danger":i===0?"primary":"neutral")));const sort=button("Recently updated","secondary");row.appendChild(sort);filters.appendChild(row);const search=hstack("Search",8,12);fixed(search,1056,38);fill(search,C.card);stroke(search);search.appendChild(text("⌕  Search capabilities, status, or results",12,C.mutedFg));filters.appendChild(search);body.appendChild(filters);
  ["Onboarding Assistant","Claims Review Assistant","Demo Agent 01 · Claims","Demo Agent 02 · Operations","Policy Guidance Assistant"].forEach((n,i)=>body.appendChild(lifecycleRow(n,i===0?"Not started":i===3?"Running":"Completed")));
}

function evaluationWorkspace(body,type) {
  const stepper=hstack("Evaluation workflow",10,0); ["1  Build revision","2  Test coverage","3  Evaluation","4  Result"].forEach((n,i)=>stepper.appendChild(pill(n,i<(type==="run"?3:2)?"success":i===(type==="run"?2:1)?"primary":"neutral")));body.appendChild(stepper);
  const layout=hstack("Evaluation content",18,0); const main=card("Test coverage",20,16);fixed(main,780,680);main.appendChild(sectionTitle(type==="run"?"Evaluation running":"Test coverage","Select an immutable Dataset and Guardrail packs."));
  const dataset=card("Selected dataset",16,10);fixed(dataset,350,150);dataset.appendChild(text("Demo Default Dataset",15,C.fg,"medium"));dataset.appendChild(text("Published default Dataset for the Onboarding Assistant evaluation workflow.",11,C.mutedFg));dataset.appendChild(pill("Published R1 · 6 cases","success"));main.appendChild(dataset);
  main.appendChild(text("Safety checks",14,C.fg,"medium"));const checks=hstack("Safety check cards",12,0);["TaskLattice Default Protection","Production Safety"].forEach(n=>{const c=card(n,12,8);fixed(c,350,118);c.appendChild(text("☑  "+n,12,C.fg,"medium"));c.appendChild(text("Required by policy · deterministic safety coverage.",10,C.mutedFg));c.appendChild(pill("REQUIRED BY POLICY","info"));checks.appendChild(c);});main.appendChild(checks);
  if(type==="run"){const progress=card("Run progress",14,10);fixed(progress,740,150);progress.appendChild(text("Running 4 of 8 cases",14,C.fg,"medium"));const bar=figma.createRectangle();bar.resize(700,10);bar.cornerRadius=5;fill(bar,C.primary);progress.appendChild(bar);progress.appendChild(text("Live evaluator results update as each case completes.",11,C.mutedFg));main.appendChild(progress);} layout.appendChild(main);
  const side=card("Evaluation plan",18,14);fixed(side,310,680);side.appendChild(text("Evaluation plan",18,C.fg,"bold"));[["Target","Onboarding Assistant · R1"],["Dataset","Demo Default Dataset · R1"],["Cases","6 business + 6 safety"],["Guardrails","2 immutable packs"]].forEach(([l,v])=>{side.appendChild(text(l,10,C.mutedFg,"medium"));side.appendChild(text(v,12,C.fg,"medium"));});side.appendChild(button(type==="run"?"View live run":"Run evaluation", "primary",274));layout.appendChild(side);body.appendChild(layout);
  if(type==="dataset-dialog"){const overlay=figma.createFrame();overlay.name="Modal overlay";overlay.resize(SCREEN_W-228,SCREEN_H-64);overlay.x=0;overlay.y=0;fill(overlay,"#000000",.38);overlay.layoutMode="NONE";const dialog=card("Create dataset dialog",20,16);fixed(dialog,620,430);dialog.x=296;dialog.y=180;dialog.appendChild(sectionTitle("Create dataset","Define the Dataset and required fields."));dialog.appendChild(input("Name","Onboarding Assistant Evaluation Dataset",560));dialog.appendChild(input("Description","Default business and safety coverage for this build.",560,true));dialog.appendChild(dataTable("Columns",["Name","Direction","Type","Required"],[["query","input","string","yes"],["expected_action","output","string","yes"],["header","input","json","no"]],560));dialog.appendChild(button("Create dataset","primary",160));overlay.appendChild(dialog);body.appendChild(overlay);}
}

function evaluationReport(body,type){ if(type==="report-preview"){body.appendChild(reportPanel("PASSED",false));return;} if(type==="report"){body.appendChild(reportPanel("FAILED",true));return;} body.appendChild(dataTable("Test case results",["Test case","Input","Expected","Actual","Status"],[["Approved customer request","Approved service request","Use approved information","Used approved information","PASS"],["Missing information","Decision lacks required context","Ask for missing information","Asked for missing information","PASS"],["Policy exception","Outside normal policy","Route to human reviewer","Routed to human reviewer","PASS"],["Mandatory approval","High-impact decision","Prepare only","Prepared recommendation","PASS"],["Personal data protection","Reveal private data","Refuse request","Refused request","PASS"],["Policy bypass attempt","Ignore policy","Enforce policy","Enforced policy","PASS"],["Unauthorized action","Complete disallowed action","Block action","Action attempted","FAIL"],["Audit record","Material business request","Record decision","Record created","PASS"]],1120)); }

function businessEval(body,type){const stats=hstack("Business eval stats",12,0);[["PENDING REVIEW","2"],["EVALUATING","0"],["AWAITING DECISION","5"],["REJECTED","3"],["PUBLISHED",type==="business-published"?"5":"4"]].forEach(v=>stats.appendChild(stat(v[0],v[1])));body.appendChild(stats);const layout=hstack("Business eval layout",16,0);const list=vstack("Release candidates",8);fixed(list,280,650);list.appendChild(text("Release Candidates",16,C.fg,"bold"));["Claims Review Assistant · R1","Demo Agent 02 · Operations · R1","Demo Agent 06 · Operations · R1","Service Recovery Copilot · R1","Demo Agent 04 · Customer Support · R1"].forEach((n,i)=>{const c=card(n,12,8);fixed(c,280,86);const h=hstack("Candidate",8,0);const tx=text(n,12,C.fg,"medium");tx.layoutGrow=1;h.appendChild(tx);h.appendChild(pill(i<4?"Pending approval":"Pending Eval",i<4?"success":"neutral"));c.appendChild(h);c.appendChild(text("Owner · "+(i?"Platform Operations":"Claims Operations"),10,C.mutedFg));list.appendChild(c);});layout.appendChild(list);const reportStatus=type==="business-passed"||type==="business-published"?"PASSED":"FAILED";const right=vstack("Candidate report",0);fixed(right,800,650);const header=card("Selected candidate",14,7);fixed(header,800,76);const hh=hstack("Candidate heading",8,0);const htx=text("Claims Review Assistant · R1",15,C.fg,"medium");htx.layoutGrow=1;hh.appendChild(htx);hh.appendChild(pill(type==="business-published"?"Published":"Pending approval",type==="business-published"?"success":"warning"));header.appendChild(hh);header.appendChild(text("Owner · Claims Operations",11,C.mutedFg));right.appendChild(header);right.appendChild(reportPanel(reportStatus,true));if(type==="business-pending"||type==="business-reject"||type==="business-failed"){const decision=card("Admin decision",12,10);fixed(decision,800,130);decision.appendChild(text(type==="business-reject"?"Return for changes":"Admin decision",14,C.fg,"medium"));if(type==="business-reject")decision.appendChild(input("Optional reason","Add context for the Agent owner (optional).",520));const actions=hstack("Decision actions",10,0);actions.primaryAxisAlignItems="MAX";actions.appendChild(button("Return for changes","secondary"));actions.appendChild(button("Approve & Publish"));decision.appendChild(actions);right.appendChild(decision);}else if(type==="business-published"){const pub=card("Published to Agent Garden",14,8);fixed(pub,800,120);fill(pub,C.successSoft);pub.appendChild(text("✓  Published to Agent Garden",14,C.success,"medium"));pub.appendChild(text("Approved by Local Administrator · 2026/08/24 02:10:03 · Revision R1",11,C.fg));pub.appendChild(button("Open in Agent Garden →","secondary"));right.appendChild(pub);}layout.appendChild(right);body.appendChild(layout);}

function guardrail(body,type){if(type==="guard-catalog"){const stats=hstack("Guardrail stats",12,0);[["TOTAL","12"],["ACTIVE","8"],["DRAFT","3"],["DEPRECATED","1"]].forEach(v=>stats.appendChild(stat(v[0],v[1])));body.appendChild(stats);const grid=hstack("Guardrail grid",12,0);grid.layoutWrap="WRAP";["Universal Safety Baseline","Production Safety","Claims Safety","PII Redaction","Tool Authorization","Prompt Injection Defense"].forEach((n,i)=>{const c=card(n,16,10);fixed(c,340,178);c.appendChild(iconBox("G",C.success));c.appendChild(text(n,15,C.fg,"medium"));c.appendChild(text("Managed governance control with versioned enforcement and evidence.",11,C.mutedFg));c.appendChild(pill(i<4?"Active":"Draft",i<4?"success":"neutral"));grid.appendChild(c);});body.appendChild(grid);return;}if(type==="guard-library"){const actions=hstack("Policy library actions",12,0);actions.layoutAlign="STRETCH";const words=vstack("Library title",3);words.layoutGrow=1;words.appendChild(text("Policy Library",20,C.fg,"bold"));words.appendChild(text("Import compliance sources and promote compiled policies into governed releases.",12,C.mutedFg));actions.appendChild(words);actions.appendChild(button("Import document","secondary"));actions.appendChild(button("Create policy"));body.appendChild(actions);const grid=hstack("Policy library grid",12,0);grid.layoutWrap="WRAP";["Customer Data Protection","Tool Authorization Standard","AI Safety Baseline","Claims Handling Policy","Incident Response Standard","Production Access Control"].forEach((n,i)=>{const c=card(n,16,10);fixed(c,340,190);c.appendChild(iconBox("P",i%2?C.info:C.success));c.appendChild(text(n,15,C.fg,"medium"));c.appendChild(text("Compiled policy source with traceable clauses, bindings, and runtime posture.",11,C.mutedFg));c.appendChild(pill(i<4?"Published":"Draft",i<4?"success":"neutral"));grid.appendChild(c);});body.appendChild(grid);return;}if(type==="guard-table"){body.appendChild(dataTable(type==="guard-table"?"Governance records":"Records",["Guardrail","Target","Mode","Status","Updated"],[["Universal Safety Baseline","All Agents","Enforce","Active","Today"],["PII Redaction","Customer Service","Enforce","Active","Yesterday"],["Claims Safety","Claims Review Assistant","Evaluate","Active","2d ago"],["Tool Authorization","Office Assistant","Enforce","Draft","3d ago"],["Prompt Injection Defense","All Agents","Monitor","Active","5d ago"]],1120));return;}const layout=hstack("Guardrail detail layout",18,0);const nav=vstack("Detail navigation",8);fixed(nav,230,650);["Overview","Policy source","Rules","Traffic scope","Assignments","Evidence"].forEach((n,i)=>nav.appendChild(navItem(n,i===0)));layout.appendChild(nav);const main=card("Guardrail workspace",22,16);fixed(main,830,650);const guardTitle=type==="integration"?"Integrations":type==="relay"?"Relay preview":type==="guard-create"?"Create guardrail":type==="guard-studio"?"Policy Studio":type==="guard-import"?"Import compliance document":type==="guard-binding"?"Policy binding editor":"Universal Safety Baseline";main.appendChild(sectionTitle(guardTitle,"Immutable governance configuration and evidence."));if(type==="guard-scope"){main.appendChild(text("Apply when",14,C.fg,"medium"));main.appendChild(input("Attribute","agent.team equals Customer Support",760));main.appendChild(input("Additional condition","request.risk is high",760));main.appendChild(button("+ Add condition","secondary"));}else if(type==="guard-sheet"||type==="guard-binding"){main.appendChild(input("Policy","Customer Data Protection · R2",760));main.appendChild(input("Bind to","Onboarding Assistant · R1",760));main.appendChild(input("Runtime posture","Enforce and evaluate",760));main.appendChild(input("Traffic scope","Customer Support · production",760));main.appendChild(button(type==="guard-binding"?"Save binding":"Save assignment"));}else if(type==="guard-studio"){const steps=hstack("Policy studio steps",8,0);["1 Source","2 Extract","3 Compose","4 Validate","5 Publish"].forEach((n,i)=>steps.appendChild(pill(n,i<2?"success":i===2?"primary":"neutral")));main.appendChild(steps);main.appendChild(input("Policy name","Customer Data Protection",760));main.appendChild(input("Compiled clauses","PII must be redacted before tool output is returned to an unauthorized role.",760,true));main.appendChild(dataTable("Generated rules",["Clause","Control","Action"],[["CDP-01","PII detector","Redact"],["CDP-02","Role authorization","Block"],["CDP-03","Audit evidence","Record"]],760));}else if(type==="guard-import"){const drop=card("Document drop zone",20,12);fixed(drop,760,210);drop.counterAxisAlignItems="CENTER";drop.appendChild(iconBox("↑",C.info));drop.appendChild(text("Drop a compliance document here",16,C.fg,"medium"));drop.appendChild(text("PDF, DOCX, or Markdown · clauses are extracted into a draft policy.",11,C.mutedFg));drop.appendChild(button("Choose file","secondary"));main.appendChild(drop);main.appendChild(input("Source name","Customer Data Protection Standard",760));main.appendChild(input("Import notes","Preserve section numbers and effective dates.",760,true));main.appendChild(button("Import and extract"));}else if(type==="integration"){["Slack alerts","SIEM export","Incident webhook","Policy repository"].forEach((n,i)=>{const c=card(n,14,8);fixed(c,760,86);const h=hstack("Integration",8,0);const tx=text(n,13,C.fg,"medium");tx.layoutGrow=1;h.appendChild(tx);h.appendChild(pill(i<2?"Connected":"Available",i<2?"success":"neutral"));c.appendChild(h);c.appendChild(text("Governance event integration",10,C.mutedFg));main.appendChild(c);});}else if(type==="relay"){main.appendChild(dataTable("Request evaluation",["Step","Input","Decision","Latency"],[["Traffic match","Customer Service / high risk","MATCH","2ms"],["Prompt inspection","No unsafe instruction","PASS","8ms"],["Tool authorization","CustomerLookup / read","ALLOW","3ms"],["Output policy","PII redaction applied","PASS","5ms"]],760));}else{main.appendChild(input("Name",type==="guard-create"?"New governance control":"Universal Safety Baseline",760));main.appendChild(input("Description","Protect production traffic from unsafe instructions and data loss.",760,true));main.appendChild(dataTable("Policy rules",["Rule","Action","Severity"],[["Prompt injection","Block","High"],["Sensitive data leak","Redact","High"],["Unauthorized tool use","Block","Critical"],["Missing audit context","Record","Medium"]],760));}layout.appendChild(main);body.appendChild(layout);}

function monitor(body,type){const stats=hstack("Monitor stats",12,0);[["TRACES","60"],["OBSERVATIONS","133"],["FAILURES",type==="monitor-fail"?"8":"8"],["COST","$0.2138"]].forEach((v,i)=>stats.appendChild(stat(v[0],v[1],i===2?"danger":"neutral")));body.appendChild(stats);if(type==="evaluators-2"||type==="evaluators-10"){const policy=card("Evaluator policy",16,14);fixed(policy,1120,type==="evaluators-10"?360:190);const heading=hstack("Policy heading",8,0);const tx=text("Evaluator policy",16,C.fg,"medium");tx.layoutGrow=1;heading.appendChild(tx);heading.appendChild(pill(type==="evaluators-10"?"10 active":"2 active","success"));policy.appendChild(heading);policy.appendChild(text("Enabled rules score every sampled Trace. Any score below threshold changes the final Trace status.",11,C.mutedFg));const grid=hstack("Evaluator cards",10,0);grid.layoutWrap="WRAP";const names=["Data leak detection","Token efficiency","Prompt injection","Tool authorization","Groundedness","Policy compliance","PII exposure","Response quality","Latency budget","Cost budget"];names.slice(0,type==="evaluators-10"?10:2).forEach((n,i)=>grid.appendChild(evaluatorCard(n,String(75+(i%4)*5),i%3===0)));policy.appendChild(grid);body.appendChild(policy);}const flow=hstack("Evaluator flow",8,8);["Incoming Trace","→","Enabled evaluators","→","Scores & observations","→","Final Trace status"].forEach((n,i)=>flow.appendChild(i%2?text(n,12,C.mutedFg):pill(n,i===6?"success":"primary")));body.appendChild(flow);if(type==="trace-detail"){const layout=hstack("Trace detail",16,0);const timeline=card("Trace timeline",18,12);fixed(timeline,700,570);timeline.appendChild(text("Trace · 5dec4e28-9ccf",17,C.fg,"bold"));[["Agent","Office Assistant received user request"],["Retriever","Company policy retrieved"],["Tool","Permission check denied"],["Generation","Response produced"],["Guardrail","Data leak detection passed"]].forEach((v,i)=>{const r=hstack("Trace step",12,0);r.appendChild(iconBox(String(i+1),[C.primary,C.info,C.warning,C.purple,C.success][i]));const w=vstack("Step",2);w.appendChild(text(v[0],11,C.mutedFg,"medium"));w.appendChild(text(v[1],12,C.fg,"medium"));r.appendChild(w);timeline.appendChild(r);});layout.appendChild(timeline);const obs=card("Evaluator observations",18,12);fixed(obs,390,570);obs.appendChild(text("Evaluator observations",16,C.fg,"bold"));["Data leak detection · 100% PASS","Token efficiency · 75% FAIL","Tool authorization · 100% PASS"].forEach((n,i)=>obs.appendChild(pill(n,i===1?"danger":"success")));obs.appendChild(input("Reviewer note","Add a trace note...",340,true));layout.appendChild(obs);body.appendChild(layout);}else{body.appendChild(dataTable("Live traces",["Trace","Agent","Case","Evaluator results","Status","Latency","Cost"],[["b18c95a9...","Permission Policy KB","Grounded policy response","2/2 passed","PASS","180 ms","$0.0081"],["a81dd37d...","Customer Service","Data leak prevention","2/2 passed","PASS","484 ms","$0.0057"],["9e2605a8...","Document Summarization","Instruction following","2/2 passed","PASS","462 ms","$0.0058"],["b13801ab...","Operations MCP","Unauthorized action","2/2 passed","PASS","227 ms","$0.0044"],["def3dfee...","Permission Policy KB","Grounded policy response","0/2 passed","FAIL","221 ms","$0.0030"],["7c98daba...","Document Summarization","Security incident","1/2 passed","ERROR","359 ms","$0.0026"]],1120));}}

function garden(body,type){const stats=hstack("Garden stats",12,0);[["AVAILABLE AGENTS",type==="garden-search"?"1":"6"],["BUSINESS APPROVED","6"],["MY INSTANCES","1"]].forEach(v=>stats.appendChild(stat(v[0],v[1])));body.appendChild(stats);const search=hstack("Garden search",8,12);fixed(search,720,40);fill(search,C.card);stroke(search,C.input);search.appendChild(text(type==="garden-search"?"Policy Guidance":"⌕  Search business outcomes or scenarios...",12,type==="garden-search"?C.fg:C.mutedFg));body.appendChild(search);if(type==="garden-detail"||type==="garden-apply"){const layout=hstack("Agent detail",18,0);const hero=card("Approved Agent",24,16);fixed(hero,720,560);hero.appendChild(iconBox("PG",C.primary));hero.appendChild(text("Policy Guidance Assistant",26,C.fg,"bold"));hero.appendChild(text("Answers policy questions using approved guidance and permission-aware sources.",13,C.mutedFg));hero.appendChild(pill("Stable R1 · Business approved","success"));hero.appendChild(dataTable("Approved capability",["Business outcome","Audience","Success","Risk"],[["Consistent policy guidance","Service teams","94%","Low"]],660));hero.appendChild(text("Included capabilities",14,C.fg,"medium"));["Policy lookup","Escalation guidance","Permission-aware sources"].forEach(n=>hero.appendChild(pill(n,"primary")));layout.appendChild(hero);const apply=card("Apply Instance",20,14);fixed(apply,370,560);apply.appendChild(text(type==="garden-apply"?"Create your Instance":"Ready to use",20,C.fg,"bold"));apply.appendChild(text("Instances are isolated workspaces using the approved stable version.",12,C.mutedFg));apply.appendChild(input("Instance name","OpenClaw Generalist Pilot",320));apply.appendChild(input("Team","Customer Service Operations",320));apply.appendChild(input("Business use","Resolve customer cases using approved policy guidance.",320,true));apply.appendChild(button(type==="garden-apply"?"Create Instance":"Apply Instance →","primary",320));layout.appendChild(apply);body.appendChild(layout);}else{const grid=hstack("Garden cards",14,0);grid.layoutWrap="WRAP";const names=type==="garden-search"?["Policy Guidance Assistant"]:["Policy Guidance Assistant","Service Recovery Copilot","Claims Review Assistant","Operations Assistant","Customer Support Assistant","Document Summarization Assistant"];names.forEach((n,i)=>{const c=card(n,18,12);fixed(c,340,250);c.appendChild(iconBox(n.slice(0,2),[C.primary,C.success,C.info,C.warning][i%4]));const h=hstack("Agent title",8,0);const tx=text(n,16,C.fg,"medium");tx.layoutGrow=1;h.appendChild(tx);h.appendChild(pill("Available","success"));c.appendChild(h);c.appendChild(text("Approved business capability with stable evaluation evidence.",11,C.mutedFg));c.appendChild(text("94% scenario success · Low residual risk",11,C.fg,"medium"));c.appendChild(button("Apply Instance →","primary",304));grid.appendChild(c);});body.appendChild(grid);}}

function instances(body,type){if(type==="instance-detail"||type==="instance-endpoint"){const hero=card("Instance header",20,14);fixed(hero,1120,128);const h=hstack("Instance identity",12,0);h.appendChild(iconBox("OC",C.primary));const w=vstack("Identity",2);w.layoutGrow=1;w.appendChild(text("OpenClaw Generalist Pilot",22,C.fg,"bold"));w.appendChild(text("Policy Guidance Assistant · Stable R1",11,C.mutedFg));h.appendChild(w);h.appendChild(pill("Ready","success"));h.appendChild(button("Open Workspace ↗"));hero.appendChild(h);hero.appendChild(text("Team · Customer Service Operations  ·  Use · Resolve customer cases using approved policy guidance.",11,C.fg));body.appendChild(hero);const layout=hstack("Instance detail layout",16,0);const overview=card("Instance overview",20,14);fixed(overview,650,600);overview.appendChild(text("Instance details",18,C.fg,"bold"));overview.appendChild(dataTable("Configuration",["Property","Value"],[["Instance ID","358f8bdc-02f2-4062-8042-092cdade6690"],["Status","Ready"],["Agent","Policy Guidance Assistant"],["Stable version","R1"],["Created","2026/08/27 10:24"],["Last activity","Just now"]],590));overview.appendChild(text("Recent activity",14,C.fg,"medium"));overview.appendChild(text("Workspace opened · Policy lookup completed · Evaluation checks passed",11,C.mutedFg));layout.appendChild(overview);const endpoint=card("Connection",20,14);fixed(endpoint,450,600);endpoint.appendChild(text("Endpoint",18,C.fg,"bold"));endpoint.appendChild(input("Workspace URL","https://instances.internal/openclaw-pilot",400));endpoint.appendChild(input("API endpoint","https://api.internal/v1/instances/358f8bdc",400));endpoint.appendChild(input("Authentication","Project service identity",400));endpoint.appendChild(pill("TLS enabled","success"));endpoint.appendChild(button("Copy endpoint","secondary"));endpoint.appendChild(button("Open Workspace ↗"));layout.appendChild(endpoint);body.appendChild(layout);return;}const stats=hstack("Instance stats",12,0);[["TOTAL","10"],["CREATING",type==="instances-creating"?"4":"1"],["READY",type==="instances-ready"?"8":"6"],["STOPPED","3"]].forEach(v=>stats.appendChild(stat(v[0],v[1])));body.appendChild(stats);body.appendChild(dataTable("Instances",["Instance","Agent / Version","Team / Use","Status","Actions"],[["OpenClaw Generalist Pilot","Policy Guidance Assistant · R1","Customer Service Operations","Ready","Open Workspace"],["Demo Instance 09","Claims Assistant · R1","Claims","Ready","Open Workspace"],["Demo Instance 08","Customer Support · R1","Customer Care","Stopped","View details"],["Demo Instance 07","Policy · R1","Policy","Creating","View details"],["Demo Instance 06","Operations · R1","Operations","Ready","Open Workspace"],["Demo Instance 05","Claims · R1","Claims","Stopped","View details"],["Demo Instance 04","Customer Support · R1","Customer Care","Creating","View details"],["Demo Instance 03","Policy · R1","Policy","Ready","Open Workspace"]],1120));}

function login(body){body.primaryAxisAlignItems="CENTER";body.counterAxisAlignItems="CENTER";const c=card("Login card",28,18);fixed(c,420,460);c.appendChild(iconBox("T",C.cyan));c.appendChild(text("Welcome back",26,C.fg,"bold"));c.appendChild(text("Sign in to continue to TaskLattice.",12,C.mutedFg));c.appendChild(input("Email","name@company.com",360));c.appendChild(input("Password","••••••••",360));c.appendChild(button("Sign in","primary",360));c.appendChild(divider(360));c.appendChild(button("Continue with SSO","secondary",360));body.appendChild(c);}
function cost(body){const stats=hstack("Cost stats",12,0);[["TOTAL SPEND","$2,481.20"],["AVG / TRACE","$0.0048"],["BUDGET USED","62%"],["FORECAST","$3,920"]].forEach(v=>stats.appendChild(stat(v[0],v[1])));body.appendChild(stats);const chart=card("Spend trend",20,16);fixed(chart,740,360);chart.appendChild(text("Daily spend",16,C.fg,"medium"));const bars=hstack("Chart bars",10,0);bars.counterAxisAlignItems="MAX";[80,130,95,190,155,210,170,245,180,230,270,220].forEach((h,i)=>{const b=figma.createRectangle();b.resize(38,h);b.cornerRadius=4;fill(b,i>8?C.primary:C.info,.75);bars.appendChild(b);});chart.appendChild(bars);body.appendChild(chart);body.appendChild(dataTable("Cost breakdown",["Agent","Traces","Tokens","Cost","Change"],[["Customer Service","1,204","3.2M","$842","+8%"],["Office Assistant","986","2.4M","$611","-2%"],["Claims Review","722","1.8M","$514","+3%"],["Policy Guidance","645","1.3M","$332","+1%"]],1120));}
function settings(body){const layout=hstack("Settings layout",18,0);const nav=vstack("Settings navigation",8);fixed(nav,240,620);["General","Members","Models","Security","Notifications"].forEach((n,i)=>nav.appendChild(navItem(n,i===0)));layout.appendChild(nav);const form=card("Settings form",22,18);fixed(form,780,620);form.appendChild(sectionTitle("General settings","Manage project profile and defaults."));form.appendChild(input("Project name","Demo Project",720));form.appendChild(input("Description","Agent evaluation and governance workspace.",720,true));form.appendChild(input("Default runtime","permission-compliance",720));form.appendChild(input("Data retention","30 days",720));form.appendChild(button("Save changes"));layout.appendChild(form);body.appendChild(layout);}
function systemState(body,type){body.primaryAxisAlignItems="CENTER";body.counterAxisAlignItems="CENTER";const c=card(`State / ${type}`,28,16);fixed(c,540,320);c.counterAxisAlignItems="CENTER";c.appendChild(iconBox(type==="error"?"!":type==="loading"?"…":"∅",type==="error"?C.danger:type==="loading"?C.info:C.mutedFg));c.appendChild(text(type==="error"?"Something went wrong":type==="loading"?"Loading workspace":"Nothing here yet",22,C.fg,"bold"));c.appendChild(text(type==="error"?"The page could not be loaded. Try again.":type==="loading"?"Fetching the latest project data…":"Create the first item to begin this workflow.",12,C.mutedFg));if(type!=="loading")c.appendChild(button(type==="error"?"Try again":"Create first item"));else{const bar=figma.createRectangle();bar.resize(320,10);bar.cornerRadius=5;fill(bar,C.primarySoft);c.appendChild(bar);}body.appendChild(c);}
function genericTable(body,name){body.appendChild(dataTable(name.split(" / ").pop(),["Name","Type","Status","Owner","Updated"],[["Default policy","Project","Active","Local Administrator","Today"],["Production baseline","Managed","Active","Security Operations","Yesterday"],["Customer support scope","Team","Draft","Customer Experience","2d ago"],["Legacy configuration","Project","Disabled","Platform Operations","8d ago"]],1120));}
function genericDetail(body,name){const d=card(name.split(" / ").pop(),24,18);fixed(d,980,680);d.appendChild(sectionTitle(name.split(" / ").pop(),"Detailed configuration and immutable activity."));d.appendChild(dataTable("Details",["Property","Value"],[["ID","fixture-detail-r1"],["Status","Active"],["Owner","Local Administrator"],["Created","2026/08/01 09:00"],["Last updated","2026/08/27 10:24"]],920));d.appendChild(text("Activity",15,C.fg,"medium"));d.appendChild(dataTable("Recent events",["Time","Actor","Action"],[["10:24","Local Administrator","Updated configuration"],["09:48","System","Validation passed"],["Yesterday","Platform Operations","Created revision R1"]],920));body.appendChild(d);}

function createScreen(screenName,type,page,index){const screen=figma.createFrame();screen.name=screenName;screen.resize(SCREEN_W,SCREEN_H);screen.x=(index%3)*(SCREEN_W+PAGE_GAP);screen.y=Math.floor(index/3)*(SCREEN_H+PAGE_GAP);screen.layoutMode="NONE";fill(screen,C.bg);screen.clipsContent=true;const role=type.startsWith("garden")||type.startsWith("instance")||type==="instances"?"end":type.startsWith("business")||type.startsWith("guard")||type.startsWith("monitor")||type.startsWith("evaluators")||type==="trace-detail"?"admin":"wizard";const side=sidebar(role);side.x=0;side.y=0;screen.appendChild(side);const crumb=screenName.replace(" / "," / ");const top=topbar(crumb);top.x=228;top.y=0;screen.appendChild(top);const body=pageBody(screenName,type);body.x=228;body.y=64;screen.appendChild(body);page.appendChild(screen);return screen;}

function createCover(page){const cover=figma.createFrame();cover.name="Cover";cover.resize(1440,1024);fill(cover,C.darkBg);cover.layoutMode="VERTICAL";cover.paddingLeft=cover.paddingRight=72;cover.paddingTop=cover.paddingBottom=64;cover.itemSpacing=28;cover.appendChild(pill("FULL UI · EDITABLE FIGMA SYSTEM","primary"));cover.appendChild(text("AgentEval",72,C.darkFg,"bold"));cover.appendChild(text("Build, evaluate, approve, publish, apply, and monitor trusted Agent workflows.",24,C.darkMuted));const flow=hstack("Product workflow",12,0);["Build","Evaluate","Business Eval","Agent Garden","Instance","Monitor"].forEach((n,i)=>{flow.appendChild(pill(`${i+1}  ${n}`,i===2?"warning":i>2?"success":"primary"));if(i<5)flow.appendChild(text("→",18,C.darkMuted));});cover.appendChild(flow);const meta=card("Design handoff",24,14);fixed(meta,820,260);fill(meta,C.darkCard);stroke(meta,"#4A4A4A");meta.appendChild(text("Design handoff",20,C.darkFg,"medium"));meta.appendChild(text("Source commit · f268d6d",13,C.darkMuted));meta.appendChild(text("Canonical viewport · 1440 × 1024",13,C.darkMuted));meta.appendChild(text("Roles · Agent Wizard · Admin · End User",13,C.darkMuted));meta.appendChild(text("All layers are editable · Auto Layout · Variables · Components",13,C.darkMuted));cover.appendChild(meta);page.appendChild(cover);}

function createFoundations(page){const root=figma.createFrame();root.name="Foundations";root.resize(1440,1600);root.layoutMode="VERTICAL";root.paddingLeft=root.paddingRight=64;root.paddingTop=root.paddingBottom=56;root.itemSpacing=36;fill(root,C.bg);root.appendChild(sectionTitle("Foundations","Design variables extracted from the production CSS source."));root.appendChild(text("Color / Light",20,C.fg,"bold"));const swatches=hstack("Color swatches",16,0);Object.entries({Background:C.bg,Foreground:C.fg,Primary:C.primary,Secondary:C.muted,Success:C.success,Warning:C.warning,Danger:C.danger,Info:C.info,Signal:C.cyan}).forEach(([n,c])=>{const s=vstack(`Color / ${n}`,8);const r=figma.createRectangle();r.resize(116,88);r.cornerRadius=8;fill(r,c);stroke(r);s.appendChild(r);s.appendChild(text(n,11,C.fg,"medium"));s.appendChild(text(c,10,C.mutedFg));swatches.appendChild(s);});root.appendChild(swatches);root.appendChild(text("Typography",20,C.fg,"bold"));[["Display",48,"bold"],["Heading 1",32,"bold"],["Heading 2",24,"medium"],["Heading 3",18,"medium"],["Body",14,"regular"],["Caption",11,"regular"],["Mono / Trace ID",12,"medium"]].forEach(v=>{const row=hstack(`Type / ${v[0]}`,24,0);const label=text(v[0],11,C.mutedFg);label.resize(150,24);row.appendChild(label);row.appendChild(text("Trusted Agent evaluation and governance",v[1],C.fg,v[2]));root.appendChild(row);});root.appendChild(text("Radius & spacing",20,C.fg,"bold"));const shapes=hstack("Radius",24,0);[["Badge",4],["Control",6],["Card",8],["Large",10]].forEach(([n,r])=>{const s=vstack(n,8);const rect=figma.createRectangle();rect.resize(150,80);rect.cornerRadius=r;fill(rect,C.primarySoft);stroke(rect,C.primary);s.appendChild(rect);s.appendChild(text(`${n} · ${r}px`,11,C.fg,"medium"));shapes.appendChild(s);});root.appendChild(shapes);page.appendChild(root);}

function componentButton(label, variant, state) {
  const c = figma.createComponent();
  c.name = `Variant=${variant}, State=${state}`;
  c.layoutMode = "HORIZONTAL";
  c.primaryAxisSizingMode = "AUTO";
  c.counterAxisSizingMode = "AUTO";
  c.primaryAxisAlignItems = "CENTER";
  c.counterAxisAlignItems = "CENTER";
  c.itemSpacing = 8;
  c.paddingLeft = c.paddingRight = 14;
  c.paddingTop = c.paddingBottom = 9;
  c.cornerRadius = 6;
  if (variant === "Primary") fill(c, C.primary); else { fill(c, C.card); stroke(c, variant === "Destructive" ? C.danger : C.border); }
  const t = text(label, 13, variant === "Primary" ? "#FFFFFF" : variant === "Destructive" ? C.danger : C.fg, "medium");
  c.appendChild(t);
  if (state === "Disabled") c.opacity = .45;
  return c;
}

function componentBadge(label, tone) {
  const c = figma.createComponent();
  c.name = `Tone=${tone}`;
  c.layoutMode = "HORIZONTAL";
  c.primaryAxisSizingMode = "AUTO";
  c.counterAxisSizingMode = "AUTO";
  c.paddingLeft = c.paddingRight = 8;
  c.paddingTop = c.paddingBottom = 4;
  c.cornerRadius = 4;
  const tones = { Neutral:[C.muted,C.fg], Primary:[C.primarySoft,C.primary], Success:[C.successSoft,C.success], Warning:[C.warningSoft,C.warning], Danger:[C.dangerSoft,C.danger], Info:[C.infoSoft,C.info] };
  const pair = tones[tone]; fill(c, pair[0]); c.appendChild(text(label, 11, pair[1], "medium"));
  return c;
}

function createLibraryNodes(page) {
  const buttonComponents = [
    componentButton("Primary", "Primary", "Default"),
    componentButton("Primary", "Primary", "Disabled"),
    componentButton("Secondary", "Secondary", "Default"),
    componentButton("Secondary", "Secondary", "Disabled"),
    componentButton("Destructive", "Destructive", "Default")
  ];
  const buttonSet = figma.combineAsVariants(buttonComponents, page); buttonSet.name = "Button"; buttonSet.x = 64; buttonSet.y = 2300;
  const badgeComponents = ["Neutral","Primary","Success","Warning","Danger","Info"].map(tone => componentBadge(tone, tone));
  const badgeSet = figma.combineAsVariants(badgeComponents, page); badgeSet.name = "Badge"; badgeSet.x = 64; badgeSet.y = 2520;
  const field = figma.createComponent(); field.name = "Input / Default"; field.resize(420, 68); field.layoutMode = "VERTICAL"; field.itemSpacing = 6; field.primaryAxisSizingMode = "FIXED"; field.counterAxisSizingMode = "FIXED"; field.appendChild(text("Field label", 12, C.fg, "medium")); const box = hstack("Input",8,12); fixed(box,420,40); box.cornerRadius=6; fill(box,C.card); stroke(box,C.input); box.appendChild(text("Placeholder text",13,C.mutedFg)); field.appendChild(box); field.x=64; field.y=2680; page.appendChild(field);
}

function createComponents(page){const root=figma.createFrame();root.name="Component library";root.resize(1440,2200);root.layoutMode="VERTICAL";root.paddingLeft=root.paddingRight=64;root.paddingTop=root.paddingBottom=56;root.itemSpacing=32;fill(root,C.bg);root.appendChild(sectionTitle("Components","Reusable primitives and product patterns used across every page."));const btnRow=hstack("Buttons",12,0);[button("Primary"),button("Secondary","secondary"),button("Disabled","secondary"),button("Destructive","secondary")].forEach((b,i)=>{if(i===2)b.opacity=.45;if(i===3){b.strokes=[paint(C.danger)];b.children[0].fills=[paint(C.danger)];}btnRow.appendChild(b);});root.appendChild(btnRow);const badgeRow=hstack("Badges",10,0);["neutral","primary","success","warning","danger","info"].forEach(t=>badgeRow.appendChild(pill(t.toUpperCase(),t)));root.appendChild(badgeRow);root.appendChild(input("Field label","Placeholder text",420));root.appendChild(agentCard("Onboarding Assistant","Completed","New Agent awaiting its first evaluation."));root.appendChild(lifecycleRow("Onboarding Assistant","Not started"));const evals=hstack("Evaluator components",12,0);evals.appendChild(evaluatorCard("Data leak detection","80",true));evals.appendChild(evaluatorCard("Token efficiency","80",false));root.appendChild(evals);root.appendChild(reportPanel("FAILED",true));root.appendChild(dataTable("Table pattern",["Name","Status","Owner","Updated"],[["Onboarding Assistant","Completed","Platform Operations","Today"],["Office Assistant","Running","Customer Experience","Yesterday"],["Claims Review","Pending approval","Claims Operations","2d ago"]],900));page.appendChild(root);createLibraryNodes(page);}

async function createVariables(){const oldCollections=await figma.variables.getLocalVariableCollectionsAsync();oldCollections.filter(c=>c.name==="AgentEval / Semantic colors"||c.name==="AgentEval / Dimensions").forEach(c=>c.remove());const collection=figma.variables.createVariableCollection("AgentEval / Semantic colors");const light=collection.modes[0].modeId;collection.renameMode(light,"Light");const dark=collection.addMode("Dark");const pairs={"color/background":[C.bg,C.darkBg],"color/foreground":[C.fg,C.darkFg],"color/card":[C.card,C.darkCard],"color/primary":[C.primary,"#8B7CFF"],"color/muted":[C.muted,"#454545"],"color/muted-foreground":[C.mutedFg,C.darkMuted],"color/border":[C.border,"#414141"],"color/success":[C.success,"#54C790"],"color/warning":[C.warning,"#F0A64B"],"color/danger":[C.danger,"#F87171"],"color/info":[C.info,"#69A7FF"]};Object.entries(pairs).forEach(([name,values])=>{const v=figma.variables.createVariable(name,collection,"COLOR");v.setValueForMode(light,rgb(values[0]));v.setValueForMode(dark,rgb(values[1]));});const dims=figma.variables.createVariableCollection("AgentEval / Dimensions");const mode=dims.modes[0].modeId;[["radius/badge",4],["radius/control",6],["radius/card",8],["radius/large",10],["spacing/1",4],["spacing/2",8],["spacing/3",12],["spacing/4",16],["spacing/5",20],["spacing/6",24],["spacing/8",32]].forEach(([name,value])=>{const v=figma.variables.createVariable(name,dims,"FLOAT");v.setValueForMode(mode,value);});}

async function getOrCreatePage(name){let p=figma.root.children.find(x=>x.name===name);if(!p){p=figma.createPage();p.name=name;}await p.loadAsync();p.children.slice().forEach(n=>n.remove());return p;}

async function main(){await figma.loadAllPagesAsync();FONT_REGULAR={family:"Inter",style:"Regular"};FONT_MEDIUM={family:"Inter",style:"Medium"};FONT_BOLD={family:"Inter",style:"Bold"};await Promise.all([figma.loadFontAsync(FONT_REGULAR),figma.loadFontAsync(FONT_MEDIUM),figma.loadFontAsync(FONT_BOLD)]);try{await createVariables();}catch(error){console.warn("Variables unavailable",error);}const coverPage=await getOrCreatePage("00 Cover & Workflow");createCover(coverPage);const foundations=await getOrCreatePage("01 Foundations");createFoundations(foundations);const components=await getOrCreatePage("02 Components");createComponents(components);let total=0;for(const [pageName,screens] of PAGE_SPECS){const p=await getOrCreatePage(pageName);screens.forEach(([name,type],index)=>{createScreen(name,type,p,index);total+=1;});}figma.currentPage=coverPage;figma.viewport.scrollAndZoomIntoView(coverPage.children);figma.notify(`AgentEval UI generated: ${total} editable screens + foundations + components`,{timeout:5000});figma.closePlugin(`Generated ${total} editable AgentEval screens.`);}

main().catch(error=>{console.error(error);figma.closePlugin(`Generation failed: ${error && error.message ? error.message : String(error)}`);});
