# Repository security and maintenance audit

Date: 2026-11-03. Repository: `Bluetwinklez/eczane-etiket`.

## Scope and method

Python desktop app, Node web dependencies, deployment template and public store/privacy documentation.

Fetched the repository and scanned all locally fetched Git refs/history with Gitleaks 8.30.1 in fully redacted mode. Reviewed tracked sensitive-file patterns and personal-email candidates. Dependency audits describe the installed/resolved graph on this date; they are not a penetration test or a guarantee that no undiscovered vulnerability exists. Uploaded binaries, remote service configuration and files outside accessible Git refs are outside this scan.

## Changes

Removed a personal contact address from four documentation/configuration files and the mobile test regex that embedded it. Deployment contact email is now supplied privately at setup. Updated vulnerable web dependencies and added an explicit `ECZANE_ETIKET_DATA_DIR` option for portable/test storage.

All maintained repositories receive an English security policy/audit entry point, a pinned and checksum-verified secret-scan workflow, credential ignore patterns and immutable action references. Existing publishing jobs retain their declared permissions. Known false positives, if any, are exempted only by exact historic finding fingerprints; no entire directory or credential rule is disabled.

## Credential and personal-data findings

No Gitleaks matches were found in fetched Git history.

No working private credential was confirmed in this review. No credential values are included in this report. If a real credential is discovered later, revoke it at its provider; deleting source cannot revoke a key or remove forks, caches or clones. Existing GitHub encrypted secrets were neither read nor copied. No live-account credential testing was attempted.

## Validation

145 existing desktop tests and two new portable-path tests passed with an isolated data directory and virtual display. All 287 web tests and all 10 mobile-shell tests passed. Python and web dependency audits report zero known vulnerabilities.

GitHub Actions YAML was checked with Actionlint. Local log files are kept outside the repositories; do not confuse historical README test counts with new results.

## Remaining limits

Old commits retain the former public contact address; no history was force-rewritten. Printer hardware, Medula and iOS/App Store behavior were not verified live.

Main READMEs and new maintenance documents are English. Historical Turkish records and existing application translations remain; this maintenance does not claim a full UI translation. Changes are published in reviewable branches/PRs, not as an untested release.

## Suggested GitHub About description

Pharmacy label printing, local inventory and POS management, and a mobile companion for Turkish workflows.

The current GitHub integration rejected repository metadata edits with HTTP 403. This prepared description can be applied when repository administration access is available; it has not been represented as an applied settings change.
