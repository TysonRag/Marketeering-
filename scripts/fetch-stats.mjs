// Pulls Feed the City email results from Brevo and saves them for the dashboard.
// Runs every hour in GitHub Actions (see .github/workflows/update-dashboard.yml).
//
// Environment:
//   BREVO_API_KEY    - required (stored as a GitHub secret, never in the code)
//   CAMPAIGN_IDS     - optional, e.g. "12,15". If empty, every sent campaign whose
//                      name contains CAMPAIGN_MATCH is included.
//   CAMPAIGN_MATCH   - optional, default "Feed the City"
//   MOCK=1           - generate demo numbers instead of calling Brevo (for testing)
//
// Output: site/data/stats.json and site/data/stats.csv
// Only totals are stored - no recipient email addresses ever leave Brevo.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const API = "https://api.brevo.com/v3";
const OUT_DIR = new URL("../site/data/", import.meta.url);
const KEY = process.env.BREVO_API_KEY;
const MATCH = (process.env.CAMPAIGN_MATCH || "Feed the City").toLowerCase();
const IDS = (process.env.CAMPAIGN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const MOCK = process.env.MOCK === "1";

async function brevo(path) {
  const res = await fetch(API + path, { headers: { "api-key": KEY, accept: "application/json" } });
  if (!res.ok) throw new Error(`Brevo ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function listCampaignIds() {
  if (IDS.length) return IDS;
  const ids = [];
  for (let offset = 0; ; offset += 100) {
    const page = await brevo(`/emailCampaigns?status=sent&limit=100&offset=${offset}`);
    const list = page.campaigns || [];
    for (const c of list) if ((c.name || "").toLowerCase().includes(MATCH)) ids.push(String(c.id));
    if (list.length < 100) break;
  }
  return ids;
}

const n = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

async function getCampaign(id) {
  const g = await brevo(`/emailCampaigns/${id}?statistics=globalStats`);
  let links = {};
  try {
    const l = await brevo(`/emailCampaigns/${id}?statistics=linksStats`);
    links = l.statistics?.linksStats || {};
  } catch { /* link stats are a nice-to-have */ }
  const s = g.statistics?.globalStats || {};
  return {
    id: String(g.id),
    name: g.name,
    subject: g.subject,
    sentDate: g.sentDate || g.scheduledAt || null,
    sent: n(s.sent),
    delivered: n(s.delivered),
    uniqueOpens: n(s.uniqueViews),
    totalOpens: n(s.viewed),
    uniqueClicks: n(s.uniqueClicks),
    totalClicks: n(s.clickers),
    hardBounces: n(s.hardBounces),
    softBounces: n(s.softBounces),
    unsubscribes: n(s.unsubscriptions),
    complaints: n(s.complaints),
    links,
  };
}

function mockCampaigns(prev) {
  // Grows a little on each run so the trend chart has something to show.
  const runs = (prev?.history?.length || 0) + 1;
  const sent = 1200, delivered = 1168;
  const opens = Math.min(640, Math.round(140 + runs * 38 + Math.random() * 10));
  const clicks = Math.min(190, Math.round(opens * 0.22));
  const split = { hero_button: 0.38, give_r250: 0.22, give_r100: 0.17, give_r500: 0.09, sponsor: 0.08, footer_button: 0.06 };
  const links = {};
  for (const [k, f] of Object.entries(split))
    links[`https://example.org/donate?utm_campaign=feed_the_city&utm_content=${k}`] = Math.round(clicks * f * 1.3);
  return [{
    id: "demo", name: "Feed the City - launch email (DEMO DATA)", subject: "Help us feed the city this season",
    sentDate: new Date(Date.now() - 3 * 864e5).toISOString(), sent, delivered,
    uniqueOpens: opens, totalOpens: Math.round(opens * 1.6), uniqueClicks: clicks, totalClicks: Math.round(clicks * 1.3),
    hardBounces: 21, softBounces: 11, unsubscribes: 6, complaints: 0, links,
  }];
}

function sum(cs, k) { return cs.reduce((a, c) => a + c[k], 0); }

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL("stats.json", OUT_DIR), "utf8")); } catch {}
  if (prev?.demo && !MOCK) prev = null; // first real run wipes the demo history

  let campaigns;
  if (MOCK) campaigns = mockCampaigns(prev);
  else {
    if (!KEY) {
      console.warn("BREVO_API_KEY is not set yet - keeping the current (demo) numbers. Add it under Settings > Secrets and variables > Actions.");
      return;
    }
    const ids = await listCampaignIds();
    if (!ids.length) console.warn(`No sent campaigns found matching "${MATCH}". The dashboard will show zeros.`);
    campaigns = [];
    for (const id of ids) campaigns.push(await getCampaign(id));
  }

  const keys = ["sent", "delivered", "uniqueOpens", "totalOpens", "uniqueClicks", "totalClicks", "hardBounces", "softBounces", "unsubscribes", "complaints"];
  const totals = Object.fromEntries(keys.map((k) => [k, sum(campaigns, k)]));

  // Merge link clicks across campaigns, grouped by the utm_content label when there is one.
  const linkTotals = {};
  for (const c of campaigns) for (const [url, count] of Object.entries(c.links)) {
    const m = url.match(/utm_content=([^&#]+)/);
    const label = m ? decodeURIComponent(m[1]) : url;
    linkTotals[label] = (linkTotals[label] || 0) + n(count);
  }

  const now = new Date().toISOString();
  const history = prev?.history ? [...prev.history] : [];
  const last = history[history.length - 1];
  // In demo mode, space the points 8 hours apart so the trend chart is readable.
  const t = MOCK ? new Date(Date.now() - 3 * 864e5 + history.length * 8 * 36e5).toISOString() : now;
  const point = { t, delivered: totals.delivered, uniqueOpens: totals.uniqueOpens, uniqueClicks: totals.uniqueClicks };
  if (!last || last.delivered !== point.delivered || last.uniqueOpens !== point.uniqueOpens || last.uniqueClicks !== point.uniqueClicks)
    history.push(point);
  if (history.length > 3000) history.splice(0, history.length - 3000);

  const out = { campaignName: "Feed the City", client: "Bereshith", updated: now, demo: MOCK, totals, links: linkTotals, campaigns, history };
  await writeFile(new URL("stats.json", OUT_DIR), JSON.stringify(out, null, 2));

  const header = ["campaign_id", "name", "sent_date", ...keys];
  const rows = campaigns.map((c) => [c.id, `"${(c.name || "").replace(/"/g, '""')}"`, c.sentDate || "", ...keys.map((k) => c[k])]);
  rows.push(["TOTAL", "", "", ...keys.map((k) => totals[k])]);
  await writeFile(new URL("stats.csv", OUT_DIR), [header, ...rows].map((r) => r.join(",")).join("\n") + "\n");

  console.log(`Saved ${campaigns.length} campaign(s). Delivered ${totals.delivered}, opened ${totals.uniqueOpens}, clicked ${totals.uniqueClicks}.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
