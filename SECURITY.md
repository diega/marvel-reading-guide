# Security policy

## Reporting a vulnerability

Please **do not open public GitHub issues** for security reports. Use one of:

1. **Preferred — GitHub's Private Vulnerability Reporting**:
   https://github.com/diega/marvel-reading-guide/security/advisories/new

   This opens a private discussion with the maintainer. The report stays
   invisible to the rest of the world until a fix lands and we publish a
   coordinated advisory together.

2. **Fallback — email**: `dieguitoll@gmail.com` with `[mrg-security]` in
   the subject. Plain text is fine; PGP not required.

## What's in scope

- The PWA shipped from `pwa/` — anything that lets a third-party hijack
  another user's local progress (Dexie store), bypass the read-only
  surface, exfiltrate their session, or abuse cached service-worker
  responses.
- The data pipeline in `scripts/` — anything that lets a malicious
  upstream source (CBH, Marvel sitemap, ComicVine response) inject
  arbitrary code or content into the build.
- The deploy workflow — anything that lets an unauthorized actor reach
  the production deploy or leak the Cloudflare API token.

Out of scope: missing rate limits on third-party endpoints, social
engineering, denial-of-service against your own browser via large local
state, anything specific to the private overlay (which lives in a
separate repo and has its own disclosure channel).

## What to expect

- Acknowledgement within ~3 business days.
- A fix or a clear "won't fix" rationale within ~30 days for valid
  reports — usually much faster, this is a small project.
- Public credit in the advisory unless you ask to stay anonymous.

## Supported versions

Only the current `main` branch is supported. There are no LTS branches
and no backported patches. The deployed Pages build always tracks the
latest commit on `main`.
