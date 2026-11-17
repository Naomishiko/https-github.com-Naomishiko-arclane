# ARCLANE

The missed-customer recovery tool. Businesses lose customers because inquiries go
unanswered — not because they're bad at the work.

Arclane organizes every inquiry, reminds staff to follow up, and puts a dollar figure
on the leads nobody answered.

## Run

```bash
node server.js                    # http://localhost:12000
PORT=3000 node server.js          # custom port
NEGLECT_HOURS=12 node server.js   # tighten the response window
```

- Landing page: `/`
- Dashboard:   `/app`

## Design

Editorial, high-contrast identity: black and white, a single hot-pink accent (#ff2d9b),
uppercase tracked labels, sharp edges, and full-bleed dark panels. Type is Archivo.

## What it does

- Captures inquiries with a value, channel and owner (web form, phone, email, text,
  Google Business, Instagram).
- Flags neglected leads — anything past the response window (`NEGLECT_HOURS`, default 24)
  or quiet too long after a first reply.
- Shows revenue at risk across the pipeline, so the value is obvious on day one.
- Drives recovery: Reply / Follow Up / Quoted / Won / Lost, which updates the numbers live.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/api/inquiries?status=&neglected=1` | List inquiries (sorted by risk) |
| GET  | `/api/summary` | KPIs: open, neglected, revenue at risk, recovered |
| POST | `/api/inquiries` | Create an inquiry |
| POST | `/api/inquiries/:id/action` | `respond`, `followup`, `quote`, `won`, `lost`, `assign`, `snooze` |
| POST | `/api/reset` | Restore the demo dataset |

Data is stored in `data/inquiries.json`.
