# TrueCare — Metronic Layout 1

## Implementation

The supplied Layout 1 is the source of the sidebar/header geometry, typography, spacing and color system. It contains a skeleton in the content region, so business pages use actual TrueCare data and React components built on the same tokens. The 280px sidebar collapses to 80px at widths >=1024px. Below 1024px, Radix manages the drawer, focus containment, background scroll lock and focus restoration. Narrow order summaries stay in document flow to avoid covering fields or the software keyboard.

`AppShell` owns navigation and theme. `Brand` always renders the unchanged image with `object-fit: contain`. All existing routes and permissions remain. Main application/session logic remains separate from lazy-loaded business screens. Modal callbacks, form handlers and API request shapes are preserved.

The original CSS files, gradient styling, decorative authentication markup and unused duplicate report/settings pages were removed. KeenIcons replaces Lucide throughout rendered UI. Print documents include the original logo, readable tables and repeated column headings.

Intentional adjustments to the template: Vietnamese navigation and business content; true TrueCare logo instead of the Metronic mark; breadcrumb/account actions instead of demo links; blue-600 for white-text primary buttons and slightly stronger muted text to satisfy WCAG AA. No demo graphs or fabricated business numbers are shipped.

## Screen inventory

| Area | Routes / states |
| --- | --- |
| Authentication | Login, password visibility, invalid credentials, recovery confirmation |
| Workspace | `/`, `/orders`, `/orders/new`, `/orders/:id`, `/customers`, `/products` |
| Finance and operations | `/sales`, `/delivered`, `/inventory`, `/fund`, `/programs`, `/report`, `/imports`, `/settings` |
| Administration | `/admin/overview`, `/admin/customers`, `/admin/orders`, `/admin/products`, `/admin/inventory`, `/admin/funds`, `/admin/employees`, `/admin/catalogs`, `/admin/imports`, `/admin/audit`, `/admin/system` |
| Transient surfaces | Drawer, modals, disabled/busy controls, toasts, empty results, pagers, loading, API errors/retry, expired session, print document |

## Verification

Baseline before the UI replacement: typecheck passed, 46 domain tests passed, 8 existing Playwright tests passed. Test-only accounts and SQLite data use `.local/metronic-qa-data`; existing `.local-data` and remote Supabase data are not altered.

The responsive matrix visits 25 routes at 360, 390, 768, 1023, 1024, 1440 and 1920px in both themes. It checks horizontal overflow, loaded routes, matching theme state, browser errors and HTTP errors. Separate interaction tests cover drawer focus/collapse, customer filtering/pagination and modals, authentication/error states, and WCAG AA. Real local API tests cover order editing/confirmation, delivery/return, CSV, printing and TXT import. The existing mocked administration tests cover permissions, bulk-delete retry IDs and saved filters.

Final acceptance on 2026-09-12:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run test` | 46 passed, 0 failed |
| `npm run build` | Passed; output in `dist/`, no oversized chunk warning |
| Built-app smoke test | All 25 routes passed through Vite preview; no page errors or HTTP resource failures |
| Responsive matrix | 42 passed: 25 routes x 7 widths x 2 themes x 3 browsers = 1,050 route visits |
| Interaction / real API suites | 48 unique cases validated across desktop Chromium, Pixel 7 Chromium, Firefox and WebKit; initial run 47 passed / 1 focus failure, then all 8 affected focus/print cases passed after fixes |
| axe WCAG 2 A/AA and 2.1 AA | No violations on login, dashboard, populated customer table, order form, admin catalogs and customer modal in both themes across all 4 browser projects |
| Logo | Source and built image retain the original SHA-256 |
| Scope audit | Server/shared/Supabase files unchanged from the pre-change source backup |

The final fixes explicitly focus a button before opening a dialog on Safari and load the print document from a Blob URL with absolute local asset URLs. Printing starts after the logo, stylesheet and fonts load; tests verify decoded logo pixels, applied CSS and the print request itself, while suppressing the operating-system dialog. No physical printer was used.

There are 90 unique Playwright cases in total. Raw logs and temporary traces were removed during publication cleanup; the acceptance results above and screenshots remain. The matrix uses contract fixtures; the business tests use the real local API and isolated test accounts.

QA uses web port 5273 and API port 5311; normal development remains 5173/3001. Vite ignores test reports, traces and QA data so writing evidence does not reload the app mid-test. Inter and KeenIcons are local build assets, with no external font request or template-folder dependency.

The frontend build archive is `.local/TrueCare-metronic-build-20260912.zip` (contents of `dist/`; backend/API hosting remains as before). QA and preview servers were stopped after verification. Normal local development was restarted at http://127.0.0.1:5173 with the existing local data directory. Run `npm run dev` from the project root to start it again. Run `npm run test:e2e` to start the isolated QA environment and repeat the browser suite.

Screenshots: [original Layout 1 light](reference-desktop-light.png), [original dark](reference-desktop-dark.png), [TrueCare desktop light](dashboard-1440-light.png), [desktop dark](dashboard-1440-dark.png), [mobile dashboard](dashboard-390-dark.png), [mobile drawer](drawer-mobile-dark.png), [mobile login](login-mobile.png), [print document](print-order.png). Additional customer, order-form and admin-catalog images cover 390px and 1440px in both themes. These have been visually reviewed against the template; the content is TrueCare business UI because the supplied template has a skeleton content area.

## Backup and restoration

Pre-change source snapshot: `C:\Users\ZGAMESVN\Downloads\TrueCare-backup-metronic-20260912-004303`. It includes tracked files and non-ignored untracked source, with the user's pre-existing changes, plus `working-tree.patch`. Baseline Git HEAD: `0cbf0b6bb41a08afe7b7ad9a392a67dd527e4710`.

To restore the old UI: stop the development server, retain a snapshot of any subsequent work, restore paths marked `modified` or `removed` from that backup, remove only paths marked `added` in [change-manifest.json](change-manifest.json), run `npm ci` and `npm run build`, then restart. The manifest compares against the source backup, including pre-existing uncommitted work, rather than against Git HEAD. Design evidence in this folder can remain. Do not use `git reset --hard`: the initial workspace already contained uncommitted changes. No database rollback or migration is needed for this UI change.

## Boundaries

The original UI conversion did not change APIs or database schemas, integrate Redis, replace the logo, or deploy production. Browser emulation verifies responsive behavior; it does not constitute testing on physical iOS/Android hardware. Administrative end-to-end calls use contract fixtures because the local server exposes employee sessions; existing domain tests continue to validate administration rules.

## Publication follow-up — 2026-09-12

The user subsequently authorized publishing the complete working tree, including earlier backend changes and migrations, to `origin/main` and updating the Render website. The pre-publication source snapshot is `C:\Users\ZGAMESVN\Downloads\TrueCare-backup-prepublish-2026-09-11T23-55-37-991Z`. Temporary logs, traces, debug images and one-off UI scripts were archived outside the project in that snapshot. `tsconfig.tsbuildinfo` is no longer tracked and is ignored; data, private configuration, migration tools and the build archive remain local.

A read-only production database check found all 12 local migrations applied. Stored SQL for migrations 009–012 matches the source; session/rate-limit tables, the rate-limit function and catalog records exist. No migration was rerun.

Production CSP testing exposed blocked Radix scroll-lock styles. The server now creates a fresh style nonce for each response and places it in HTML served at the root, `/index.html` and client routes. Before rendering, React supplies this nonce through `get-nonce` 1.0.1 to Radix's stylesheet helper. The policy remains strict without `unsafe-inline`; API payloads and database schemas are unchanged by this fix.

Zod draft validation now uses `jitless: true`, avoiding an eval probe that Firefox reported as a CSP violation. Valid, stale, corrupted and invalid drafts were checked. Built-production drawer, modal and print checks passed under the actual CSP on Chromium, Firefox and WebKit, with no console errors. The order edit/confirm/delivery/return/export/print cases were rerun after this correction.

Publication verification: typecheck, 46 domain tests and build passed. All 90 distinct Playwright cases were verified across the main run and replacement runs: all 48 interaction/business cases, 28 Chromium/WebKit matrix cases including two reruns after Vite reoptimized dependencies, and a complete successful 14-case Firefox matrix rerun. The Firefox matrix now sets viewport dimensions before page creation to avoid a Windows headed-window resize stall. Logs are retained only in the external pre-publication backup, not in source control. The dependency audit reported zero vulnerabilities, and logo hashes remain unchanged.
