"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 12000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "inquiries.json");

// A lead is "neglected" once it has sat unanswered past this many hours.
const NEGLECT_HOURS = Number(process.env.NEGLECT_HOURS || 24);

const CHANNELS = ["web form", "phone", "email", "text", "Google Business", "Instagram"];
const STATUSES = ["new", "contacted", "quoted", "won", "lost"];

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function hoursSince(iso, ref = Date.now()) {
  return (ref - new Date(iso).getTime()) / 36e5;
}

// Deterministic seed so the demo tells a realistic, stable story.
function seedInquiries() {
  const ref = Date.now();
  const h = (n) => new Date(ref - n * 36e5).toISOString();
  return [
    {
      id: "INQ-1041",
      customer: "Marcus Webb",
      company: "Webb Roofing",
      channel: "web form",
      service: "Roof inspection + repair quote",
      value: 4800,
      receivedAt: h(52),
      status: "new",
      firstRespondedAt: null,
      lastActivityAt: h(52),
      followUps: 0,
      owner: "Unassigned",
      notes: "Asked for a quote on a leaking flat roof before the rainy season.",
    },
    {
      id: "INQ-1040",
      customer: "Priya Nair",
      company: "Spotless Co.",
      channel: "email",
      service: "Weekly office cleaning",
      value: 1450,
      receivedAt: h(30),
      status: "new",
      firstRespondedAt: null,
      lastActivityAt: h(30),
      followUps: 0,
      owner: "Unassigned",
      notes: "Wants a recurring contract for a 40-desk office.",
    },
    {
      id: "INQ-1039",
      customer: "Dana Okafor",
      company: "Okafor Consulting",
      channel: "phone",
      service: "Discovery call",
      value: 6000,
      receivedAt: h(9),
      status: "new",
      firstRespondedAt: null,
      lastActivityAt: h(9),
      followUps: 0,
      owner: "Unassigned",
      notes: "Left a voicemail; wants pricing for a 6-week engagement.",
    },
    {
      id: "INQ-1038",
      customer: "Liam Foster",
      company: "Foster & Daughters Salon",
      channel: "Instagram",
      service: "Bridal party booking",
      value: 900,
      receivedAt: h(70),
      status: "contacted",
      firstRespondedAt: h(48),
      lastActivityAt: h(48),
      followUps: 1,
      owner: "Rosa",
      notes: "Quoted verbally, then went quiet. Two weeks to the wedding.",
    },
    {
      id: "INQ-1037",
      customer: "Grace Lindqvist",
      company: "Northside Dental",
      channel: "web form",
      service: "Quarterly compliance audit",
      value: 12000,
      receivedAt: h(120),
      status: "quoted",
      firstRespondedAt: h(100),
      lastActivityAt: h(96),
      followUps: 2,
      owner: "Tomas",
      notes: "Big-ticket. Quote sent, no reply in four days.",
    },
    {
      id: "INQ-1036",
      customer: "Owen Barrett",
      company: "Barrett Landscaping",
      channel: "text",
      service: "Spring cleanup",
      value: 650,
      receivedAt: h(4),
      status: "new",
      firstRespondedAt: null,
      lastActivityAt: h(4),
      followUps: 0,
      owner: "Unassigned",
      notes: "Sent a photo of the yard; asked for a same-week slot.",
    },
    {
      id: "INQ-1035",
      customer: "Sofia Marchetti",
      company: "Marchetti Interiors",
      channel: "email",
      service: "Full apartment refresh",
      value: 9800,
      receivedAt: h(200),
      status: "contacted",
      firstRespondedAt: h(190),
      lastActivityAt: h(180),
      followUps: 1,
      owner: "Rosa",
      notes: "Wanted a mood board; we promised one and never sent it.",
    },
    {
      id: "INQ-1034",
      customer: "Henry Cole",
      company: "Cole Plumbing",
      channel: "Google Business",
      service: "Emergency callout",
      value: 400,
      receivedAt: h(2),
      status: "won",
      firstRespondedAt: h(1.5),
      lastActivityAt: h(1),
      followUps: 1,
      owner: "Tomas",
      notes: "Answered in 30 minutes. Booked on the spot.",
    },
    {
      id: "INQ-1033",
      customer: "Aisha Rahman",
      company: "Rahman Legal",
      channel: "phone",
      service: "Website redesign",
      value: 7200,
      receivedAt: h(300),
      status: "lost",
      firstRespondedAt: h(240),
      lastActivityAt: h(220),
      followUps: 0,
      owner: "Unassigned",
      notes: "Took four days to call back. Went with someone faster.",
    },
    {
      id: "INQ-1032",
      customer: "Noah Petrov",
      company: "Petrov Fitness",
      channel: "web form",
      service: "Member app build",
      value: 15000,
      receivedAt: h(14),
      status: "new",
      firstRespondedAt: null,
      lastActivityAt: h(14),
      followUps: 0,
      owner: "Unassigned",
      notes: "Serious budget. Asked for a scoping call this week.",
    },
  ];
}

function loadDb() {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    const db = { inquiries: seedInquiries(), createdAt: nowIso() };
    saveDb(db);
    return db;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    const db = { inquiries: seedInquiries(), createdAt: nowIso() };
    saveDb(db);
    return db;
  }
}

function saveDb(db) {
  ensureDirs();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Derive the fields the UI cares about (aging, risk, next action).
function decorate(inq) {
  const ref = Date.now();
  const ageHours = hoursSince(inq.receivedAt, ref);
  const awaitingResponse = !inq.firstRespondedAt;
  const unansweredHours = awaitingResponse ? ageHours : 0;
  const sinceLastContact = hoursSince(inq.lastActivityAt, ref);

  const open = inq.status === "new" || inq.status === "contacted" || inq.status === "quoted";
  const neglected = open && ((awaitingResponse && ageHours > NEGLECT_HOURS) || (!awaitingResponse && sinceLastContact > NEGLECT_HOURS * 2));
  const atRisk = neglected ? inq.value : 0;

  const responseHours = inq.firstRespondedAt ? hoursSince(inq.receivedAt, ref) - hoursSince(inq.firstRespondedAt, ref) : null;

  let priority = "normal";
  if (neglected && inq.value >= 5000) priority = "critical";
  else if (neglected) priority = "high";
  else if (open && awaitingResponse && ageHours > NEGLECT_HOURS / 2) priority = "high";

  let nextAction;
  if (!open) nextAction = inq.status === "won" ? "Closed — won" : "Closed — lost";
  else if (awaitingResponse) nextAction = `Reply now — waiting ${Math.round(ageHours)}h`;
  else if (sinceLastContact > NEGLECT_HOURS) nextAction = `Follow up — quiet ${Math.round(sinceLastContact)}h`;
  else nextAction = "On track";

  return {
    ...inq,
    ageHours: Math.round(ageHours * 10) / 10,
    unansweredHours: Math.round(unansweredHours * 10) / 10,
    sinceLastContact: Math.round(sinceLastContact * 10) / 10,
    neglected,
    atRisk,
    priority,
    nextAction,
    open,
    responseHours: responseHours === null ? null : Math.round(responseHours * 10) / 10,
  };
}

function summary(inquiries) {
  const d = inquiries.map(decorate);
  const open = d.filter((x) => x.open);
  const neglected = d.filter((x) => x.neglected);
  const responded = d.filter((x) => x.firstRespondedAt);
  const closed = d.filter((x) => x.status === "won" || x.status === "lost");
  const won = d.filter((x) => x.status === "won");

  const avgResponse =
    responded.length > 0
      ? responded.reduce((s, x) => s + (hoursSince(x.receivedAt) - hoursSince(x.firstRespondedAt)), 0) / responded.length
      : 0;

  return {
    total: d.length,
    open: open.length,
    neglected: neglected.length,
    revenueAtRisk: neglected.reduce((s, x) => s + x.value, 0),
    openValue: open.reduce((s, x) => s + x.value, 0),
    recoveredValue: won.reduce((s, x) => s + x.value, 0),
    wonCount: won.length,
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
    avgResponseHours: Math.round(avgResponse * 10) / 10,
    neglectHours: NEGLECT_HOURS,
  };
}

function send(res, code, body, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, buf, MIME[ext] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    // ---- API ----
    if (pathname === "/api/inquiries" && req.method === "GET") {
      const db = loadDb();
      const status = url.searchParams.get("status");
      const neglectedOnly = url.searchParams.get("neglected") === "1";
      let items = db.inquiries.map(decorate);
      if (status && status !== "all") items = items.filter((x) => x.status === status);
      if (neglectedOnly) items = items.filter((x) => x.neglected);
      items.sort((a, b) => b.atRisk - a.atRisk || b.ageHours - a.ageHours);
      return send(res, 200, { inquiries: items });
    }

    if (pathname === "/api/summary" && req.method === "GET") {
      const db = loadDb();
      return send(res, 200, summary(db.inquiries));
    }

    if (pathname === "/api/inquiries" && req.method === "POST") {
      const body = await readBody(req);
      const db = loadDb();
      const id = "INQ-" + (1000 + db.inquiries.length + Math.floor(Math.random() * 900) + 1);
      const inq = {
        id,
        customer: String(body.customer || "New inquiry").slice(0, 120),
        company: String(body.company || "").slice(0, 120),
        channel: CHANNELS.includes(body.channel) ? body.channel : "web form",
        service: String(body.service || "General inquiry").slice(0, 200),
        value: Math.max(0, Number(body.value) || 0),
        receivedAt: nowIso(),
        status: "new",
        firstRespondedAt: null,
        lastActivityAt: nowIso(),
        followUps: 0,
        owner: "Unassigned",
        notes: String(body.notes || "").slice(0, 500),
      };
      db.inquiries.unshift(inq);
      saveDb(db);
      return send(res, 201, decorate(inq));
    }

    const actionMatch = pathname.match(/^\/api\/inquiries\/([^/]+)\/action$/);
    if (actionMatch && req.method === "POST") {
      const id = decodeURIComponent(actionMatch[1]);
      const body = await readBody(req);
      const db = loadDb();
      const inq = db.inquiries.find((x) => x.id === id);
      if (!inq) return send(res, 404, { error: "inquiry not found" });
      const action = body.action;

      if (action === "respond") {
        if (!inq.firstRespondedAt) inq.firstRespondedAt = nowIso();
        inq.status = inq.status === "new" ? "contacted" : inq.status;
        inq.lastActivityAt = nowIso();
        inq.owner = body.owner || inq.owner === "Unassigned" ? body.owner || "You" : inq.owner;
      } else if (action === "followup") {
        inq.followUps = (inq.followUps || 0) + 1;
        inq.lastActivityAt = nowIso();
        inq.status = inq.status === "new" ? "contacted" : inq.status;
      } else if (action === "quote") {
        inq.status = "quoted";
        inq.lastActivityAt = nowIso();
      } else if (action === "won" || action === "lost") {
        inq.status = action;
        inq.lastActivityAt = nowIso();
      } else if (action === "snooze") {
        inq.lastActivityAt = nowIso();
      } else if (action === "assign") {
        inq.owner = String(body.owner || "You").slice(0, 60);
        inq.lastActivityAt = nowIso();
      } else {
        return send(res, 400, { error: "unknown action" });
      }

      saveDb(db);
      return send(res, 200, decorate(inq));
    }

    if (pathname === "/api/reset" && req.method === "POST") {
      const db = { inquiries: seedInquiries(), createdAt: nowIso() };
      saveDb(db);
      return send(res, 200, { ok: true, count: db.inquiries.length });
    }

    // ---- Static ----
    if (pathname === "/" ) return serveStatic(res, path.join(PUBLIC_DIR, "index.html"));
    if (pathname === "/app" || pathname === "/app/") return serveStatic(res, path.join(PUBLIC_DIR, "app.html"));

    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, safe);
    if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain");
    return serveStatic(res, filePath);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Arclane running on http://localhost:${PORT}`);
  console.log(`  Landing:   http://localhost:${PORT}/`);
  console.log(`  Dashboard: http://localhost:${PORT}/app`);
});
