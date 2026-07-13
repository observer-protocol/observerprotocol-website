# REPO_MAP.md — observer-protocol-website

## Canonical Purpose

This repository contains the **public-facing website and schema publishing layer** for Observer Protocol. It owns the HTML/CSS/JS that renders observerprotocol.org, the canonical schemas that are served at observerprotocol.org/schemas/*, and the test issuer DID documents used for E2E testing. This is a **publishing repository** — it does not contain source-of-truth protocol code. Schemas and DID documents are copied FROM `observer-protocol` and deployed here for public access via Netlify.

## What Lives Here

- **Static HTML pages** (`*.html`) — Marketing pages, docs, architecture diagrams, quickstart guides
- **Canonical schemas** (`schemas/`) — **COPIED FROM** `observer-protocol/schemas/`, served at observerprotocol.org/schemas/*
- **Test issuer DIDs** (`test-issuers/`) — DID documents for E2E testing (e.g., `did:web:observerprotocol.org:test-issuers:kyb-test-1`)
- **Netlify configuration** (`netlify.toml`) — Redirects, headers, deployment settings
- **Architecture papers** (`papers/`) — Published research and specifications. (`whitepaper.md` / `whitepaper.docx` are RETIRED as of 2026-07-13: archived-in-place, unlinked, de-indexed — superseded by the site and the public repos. Not maintained.)
- **Registry page** (`registry.html`) — Public agent registry listing
- **OWS demo assets** (`ows/`) — OWS (Open Wallet Standard) demo materials
- **Shared styles** (`shared-styles.css`) — CSS used across all pages

## What Does NOT Live Here

- **API server code** — Lives in `observer-protocol/api/` (FastAPI, port 8000)
- **Protocol logic** — DID resolution, credential verification, attestation caching (all in OP repo)
- **Database migrations** — Schema evolution lives in `observer-protocol/migrations/`
- **Locked spec documents** — Working specs in `observer-protocol/docs/`, not here
- **AT Enterprise dashboard** — Separate Next.js app at `agenticterminal-dashboard`
- **Python code** — This is a static site; no backend runtime

## What Deploys From Here, To Where

| Component | Deployment Target | Notes |
|-----------|------------------|-------|
| `*.html` | Netlify → observerprotocol.org | Static site hosting |
| `schemas/*` | Netlify → observerprotocol.org/schemas/* | Canonical schema URLs |
| `test-issuers/*` | Netlify → observerprotocol.org/test-issuers/* | Test DID resolution |
| `_redirects` / `netlify.toml` | Netlify edge | Routing and caching rules |

**Platform:** Netlify (observer-protocol-site)  
**Production URL:** https://observerprotocol.org  
**Staging URL:** https://observer-protocol-staging.netlify.app  
**Deployment:** Auto-deploy on push to master

## How to Verify You Are in the Right Repo

**1. Expected `git remote -v` output:**
```
origin	https://github.com/observer-protocol/observerprotocol-website.git (fetch)
origin	https://github.com/observer-protocol/observerprotocol-website.git (push)
```

**2. Expected path pattern:**
```
/home/futurebit/.openclaw/workspace/observer-protocol-website
```

**3. Distinguishing file/directory:**
- `netlify.toml` — Netlify-specific config (unique to this repo)
- `schemas/` — Public-facing schemas (copied from OP, but served from here)
- `test-issuers/` — DID documents for test scenarios
- `*.html` — Static pages (no server-side code)

## Critical Workflow: Schema Publishing

Per §13.3 and §13.4, schemas must be **sourced from canonical repo** and **byte-identical**:

```bash
# CORRECT workflow:
cd /media/nvme/observer-protocol/schemas/
# Edit canonical schema
git commit -m "Update KYB schema"

# Copy to website repo:
cp /media/nvme/observer-protocol/schemas/kyb-attestation/v1.json \
   /home/futurebit/.openclaw/workspace/observer-protocol-website/schemas/kyb-attestation/v1.json

# Verify identical:
diff /media/nvme/observer-protocol/schemas/kyb-attestation/v1.json \
     /home/futurebit/.openclaw/workspace/observer-protocol-website/schemas/kyb-attestation/v1.json
# (should produce no output)

cd /home/futurebit/.openclaw/workspace/observer-protocol-website
git commit -m "Publish updated KYB schema"
git push  # Netlify auto-deploys
```

**NEVER** edit schemas directly in this repo without updating the canonical source in `observer-protocol`.

## Known Siblings

| Sibling | What Distinguishes It |
|---------|----------------------|
| `observer-protocol` | **Canonical source** — API server, schemas (source), protocol logic. This repo *publishes* artifacts copied from there |
| `agentic-terminal-db` | AT Enterprise backend — Python API on port 8090, not related to this static site |
| `agenticterminal-dashboard` | Next.js frontend — separate dashboard app, not this marketing site |

**Critical confusion to avoid:** This repo's `schemas/` directory contains **copies** of schemas, not the source-of-truth. The source is in `observer-protocol/schemas/`. During Spec 3.1 deployment, a schema was initially authored here and committed — this was wrong. Schemas must originate in `observer-protocol`, be verified there, then copied here for publication.

---

**Last updated:** April 22, 2026 per Build Principles v0.4 §13.11