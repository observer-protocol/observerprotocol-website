# Observer Protocol — Site Upgrade v2.0
## Implementation Guide for Maxi

**Prepared by Boyd via Claude · March 2026**

---

## What's in this package

| File | Status | Priority |
|------|--------|----------|
| `shared-styles.css` | New | Deploy first — all pages depend on it |
| `index.html` | Full rewrite | P1 |
| `agents.html` | Full rewrite | P1 — was nearly empty |
| `api.html` | Full rewrite | P1 — replaces broken white Swagger aesthetics |
| `architecture.html` | Existing — no change needed | — |
| `spec.html` | Existing — no change needed | — |
| `sdk.html` | Existing — no change needed | — |

---

## Step 1 — Deploy shared-styles.css

All three new pages import `shared-styles.css` via a relative path. This file must exist at the root of the site before any pages are deployed, or fonts and variables will be missing.

```bash
# Copy to site root (adjust path to your actual static file directory)
cp shared-styles.css /path/to/observerprotocol.org/public/shared-styles.css
```

The CSS imports IBM Plex Mono and IBM Plex Sans from Google Fonts via CDN. No local font files needed.

---

## Step 2 — Replace index.html

Drop `index.html` into the site root. Key changes from current version:

- Hero: proper h1 scale, `npm install @observerprotocol/sdk` copy-to-clipboard block
- Status bar: live network stats strip (hardcoded for now — see Step 4 for live data)
- Genesis block: styled verification card with preimage math
- "What it answers" section: 4-cell grid
- Rails grid: Lightning (live), x402 (live), Solana/Ark/Fedimint (coming)
- 3-step integration with real code snippet
- Principles section with manifesto pull quote
- Footer: consistent across all pages

---

## Step 3 — Replace agents.html

The old agents page was essentially empty (12 agents listed as one line of text). The new page:

- Registry stats bar (12 agents, 9 txns, 2 rails, genesis date)
- Filter bar: All / VERIFIED / PENDING / REGISTERED / Lightning / x402
- Card grid with real data for Maxi (#0001), Vicky (#0002), AgentPay (#0003)
- Cards #0004–#0012 use placeholder key hashes — **update these with real data from the PostgreSQL registry**
- Click any named agent card to open a detail modal
- Badge levels section at bottom
- Register CTA linking to SDK

### Data to update in agents.html

Search for `TODO` comments — there are none, but update these hardcoded values with live data:

| Element | Current Value | Source |
|---------|--------------|--------|
| `id="total-agents"` | 12 | `GET /api/v1/stats` |
| `id="verified-count"` | 9 | `GET /api/v1/stats` |
| Agent #0004–#0012 key hashes | placeholder sha256 stubs | PostgreSQL `agents` table |
| Agent #0004–#0012 statuses | PENDING / REGISTERED | PostgreSQL `agents` table |

**Optional enhancement:** Replace the hardcoded agent grid with a fetch call to `GET /observer/feed` on page load so the registry stays current automatically. The card template is ready — just needs a JS render loop.

---

## Step 4 — Replace api.html

The existing site used the default Swagger UI (white background, generic styling). The new `api.html` is a custom dark API reference that:

- Matches the site aesthetic fully
- Links to the live Swagger UI at `api.observerprotocol.org/docs` for those who want interactive testing
- Documents all 13 endpoints with expandable cards
- Shows real request/response schemas from the ARP spec
- Includes "Try it ↗" links that hit live endpoints directly

No backend changes required. The Swagger UI can remain at `/docs` as a secondary reference.

---

## Step 5 — Live data in the status bar (index.html)

The hero status bar currently shows hardcoded values. To make it live, add this script before `</body>` in `index.html`:

```javascript
async function refreshStatus() {
  try {
    const r = await fetch('https://api.observerprotocol.org/api/v1/stats');
    const d = await r.json();
    // Update DOM elements as needed based on actual response shape
    // e.g. document.querySelector('.status-bar .registry-entries').textContent = d.registry_entries;
  } catch(e) { /* fail silently, hardcoded fallback shows */ }
}
refreshStatus();
```

Adjust field names to match the actual `/stats` response shape.

---

## Step 6 — Nav active states

The `active` class on nav links is hardcoded per page (e.g., `agents.html` sets `class="active"` on the Agents link). This is intentional — no JS needed. Each file already has the correct active link set.

If the site uses a template/include system (e.g., SSR or a static site generator), extract the nav into a shared partial and pass the active page as a variable.

---

## Existing pages — no changes needed

`architecture.html`, `spec.html`, and `sdk.html` are already well-structured with dark aesthetics and solid content. They share the same nav structure, so they will inherit the new nav style automatically once `shared-styles.css` is deployed — **but only if those pages also import it**.

### Check existing pages for CSS import

Open each existing page and verify it has:

```html
<link rel="stylesheet" href="shared-styles.css">
```

If existing pages use an inline `<style>` block or a different CSS file, they will NOT automatically pick up the shared variables. Two options:

**Option A (recommended):** Add the `shared-styles.css` import to existing pages. The CSS variables will take effect without breaking anything — the new CSS only adds variables and resets, it does not override custom rules already present.

**Option B:** Leave existing pages as-is. The new pages will look consistent with each other; existing pages will stay visually as they are.

---

## Adopters page

The `production-adopters.html` page currently uses a white background that breaks the dark aesthetic. A quick fix:

```css
/* Add to the page's <style> block or inline */
body { background: #0a0a0a; color: #e8e8e8; }
.card, .adopter-card { background: #141414; border: 1px solid #2a2a2a; }
```

A full rewrite of this page is lower priority — once there are 3+ adopters it warrants a proper grid treatment like the agents page.

---

## Deployment checklist

```
[ ] shared-styles.css deployed to site root
[ ] index.html replaced
[ ] agents.html replaced  
[ ] api.html replaced
[ ] Verify shared-styles.css loads (check browser network tab — 200, not 404)
[ ] Test nav links across all pages
[ ] Update agent card data from PostgreSQL (agents #0004–#0012)
[ ] Test mobile layout (all grids use auto-fit — should reflow cleanly)
[ ] Optional: wire status bar to live /stats endpoint
```

---

## Design system reference

All design tokens live in `shared-styles.css` under `:root {}`. To change anything globally:

| Variable | Current Value | Purpose |
|----------|--------------|---------|
| `--orange` | `#f7931a` | Bitcoin orange — primary accent |
| `--bg` | `#0a0a0a` | Page background |
| `--bg-card` | `#141414` | Card backgrounds |
| `--border` | `#2a2a2a` | Default borders |
| `--verified` | `#22c55e` | Green — VERIFIED status |
| `--font-mono` | IBM Plex Mono | Primary font — all UI |
| `--font-sans` | IBM Plex Sans | Body copy / descriptions |

---

*Observer Protocol v0.2 · Site upgrade prepared March 2026*
*The trust layer for the agentic economy.*
