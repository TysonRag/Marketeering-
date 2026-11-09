# Feed the City: email campaign + results dashboard

A fundraising email for **Bereshith** (NPO 229-333) and a live dashboard showing how it performs.

**How it works:**

```
Brevo (sends the email, records opens and clicks)
   │  every hour
   ▼
GitHub Action (scripts/fetch-stats.mjs pulls the numbers, saves them in site/data/)
   │
   ▼
GitHub Pages dashboard (site/index.html) ─► share this link with the agency
```

GitHub can't send email itself, so Brevo does the sending and tracking. Its free plan covers 300 emails a day.

---

## 1. Set up Brevo (one-off)

1. Create a free account at brevo.com.
2. **Choose your "from" address.** Go to *Senders, Domains & Dedicated IPs → Domains* and add `bereshithcenter.org`. Brevo shows you a few DNS records to add wherever the domain is managed. Once those are verified, you can send from any address on that domain, for example `feedthecity@bereshithcenter.org` or `donate@bereshithcenter.org`.
   - Don't send from a Gmail or Outlook address. Those providers block bulk mail sent "from" them by outside services, and your emails will land in spam or bounce.
3. **Contacts:** import only people who have agreed to hear from Bereshith (POPIA). Add a `FIRSTNAME` column so the email says "Hi Thandi" instead of "Hi friend".
4. **API key:** go to *SMTP & API → API Keys → Generate*. Copy it; you'll need it in step 2.

## 2. Send the email

1. *Campaigns → Create → Email*. **The campaign name must contain "Feed the City"** (for example "Feed the City - launch"). The dashboard uses the name to find it.
2. Design → **Code your own** → paste in `email/feed-the-city-email.html`.
3. Replace every `REPLACE_...` placeholder (the top of the file lists them). Keep the `?utm_...` part that follows the donate link.
4. Send yourself a test, check it on your phone, then send or schedule it.

Each button carries its own tag (`utm_content=give_r250` and so on), so the dashboard shows exactly which button people clicked.

## 3. Turn on the dashboard in GitHub

1. Upload everything in this folder to the repo `TysonRag/Marketeering-`, keeping the folder structure. On a Mac, the `.github` folder is hidden in Finder: press **Cmd + Shift + .** to show it.
2. *Settings → Secrets and variables → Actions → New repository secret*. Name: `BREVO_API_KEY`. Value: your Brevo key.
3. *Settings → Pages → Source:* **GitHub Actions**.
4. *Actions → Update Feed the City dashboard → Run workflow*.
5. Your dashboard is live at **https://tysonrag.github.io/Marketeering-/**, and it updates itself every hour.

The demo numbers it ships with disappear on the first real run.

### Optional settings (Settings → Secrets and variables → Actions → *Variables*)
| Variable | What it does |
|---|---|
| `CAMPAIGN_IDS` | Track specific Brevo campaigns by ID, e.g. `12,15`, instead of matching on the name |
| `CAMPAIGN_MATCH` | Match a different name, e.g. `FTC` (default: `Feed the City`) |

### Funds raised
Brevo can't see bank or PayFast payments. To show money raised, edit `site/data/donations.json` on GitHub (set `amount`, and optionally `goal` and `asOf`) and commit. A "Funds raised" tile appears automatically.

## What the agency gets
- A live link with sent, reached, opened, clicked, click-to-open, bounces and unsubscribes, plus the trend over time and clicks per button
- **Download CSV** and **Print / save as PDF** buttons on the page itself

## Good to know
- The repo is public, so the dashboard is public too. It only holds totals: no names or email addresses.
- Open counts are an estimate, because Apple Mail opens emails automatically for privacy. Clicks are the reliable number.
- To test without Brevo, run `MOCK=1 node scripts/fetch-stats.mjs` and open `site/index.html` through a local server.
