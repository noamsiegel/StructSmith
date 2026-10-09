# Workflow editor audit

Audit date: 2026-10-08. Scope: interactive HOA workflow editing in this fork;
exports are excluded at the user's request. Behavior is documented in
[FORK.md](FORK.md). The user confirmed the hardware canvas gestures.

## Current source and acceptance status

The current source implements preferred detail destinations, dependency/where-used
lists, tag focus, scenario CRUD/playback, selective inline expansion, three connector
attachment slots per side, resource links, attached comment pins with reply search,
and the creation toolbar with searchable Cmd/Ctrl+/ help. Sidebars now start hidden;
the legend opens from top navigation, separately from bottom-center creation.
Source implementation is not browser acceptance.

The October 8 source also implements Section fit-to-contents, selection colors,
type switching and shape silhouettes. The fork guide owns the behavior contract;
this audit distinguishes actual browser observations from source-only support.

## October 8 acceptance evidence

### Multi-selection and connector movement

- `bun run check`, `bun run typecheck`, `bun run test`, `bun run build`,
  `bun run build:local` and `bun run build:site` completed. The test suite
  collected 334 tests with 2,318 assertions. Mutation checks detected missing
  nested/independent selection members, floating-point delta equality, and
  removal of the fixture's same-side connector. Existing Biome schema-version
  and Vite bundle-size notices remain.
- Native browser `tab.click(point, {key: 'shift'})` toggled model objects,
  annotations and Section headers; modified title clicks did not start rename.
  `tab.drag(...)` moved mixed model/note selections, disjoint Sections and nested
  contents. Selecting a Section plus its child did not double-move the child.
  Undo/Redo restored the frame and member coordinates together.
- On the rebuilt service at `127.0.0.1:8090`, moving both endpoints by `(52, 42)`
  moved the middle lane from `x1163.5` to `x1215.5`. Moving only the action
  left `x1215.5` unchanged; Undo restored its coordinates and saved controls.
  Reload retained saved geometry. A right/right automatic attachment kept its
  lane at `x847.5` after moving only the source in development.
- With the development API suspended using `kill -STOP`, two consecutive native
  drags accumulated `(84, 60)`. After `kill -CONT`, GET
  `/api/views/demo-native-flow` returned the same positions and bend lane
  `x1247.5`, without rounding drift. The production build emitted no new browser
  console errors on the exercised path. Browser network tracing was unavailable;
  REST reads independently confirmed persisted state.
- `bun scripts/smoke-local-helper.ts structsmith-fork:selection-movement`
  covered HTML, authenticated Docker REST, host CLI, scoped MCP writes, streaming
  and Stop. `/health` returned database/MCP `ok`. All five workspace IDs and all
  four non-demo revisions survived the local service replacement. The demo was
  reset through its snapshot-preserving command after acceptance.
- Section clipboard copying, mobile, exports and a full browser lock-refusal
  exercise remain unverified; existing lock-translation tests still pass.

### Native elements and view annotations

Text, notes and tables belong to a view. Data, documents, start/end, fork/join
and merge belong to the shared model. The creation palette, type switching,
domain validation and MCP use the same contracts. Mermaid imports infer native
types and preserve explicit kind metadata; generic unconnected subgraphs become
Sections, while connected subgraphs become Subprocesses.

- `bun run check`, `bun run typecheck` and `bun run test` returned no errors;
  the suite collected 328 tests across 62 files with 2,269 assertions. Targeted
  mutations caught annotation, import, layout, selection and reversed-layout
  regressions. Biome's schema-version notice is informational.
- Browser creation/edit/save/reload covered text, notes and quoted multiline
  spreadsheet paste. Color, resizing, Section movement, duplicate/delete/Undo
  and read-only preview were exercised. A stopped-service note save preserved
  its draft and retry saved it. A default-layer Section membership rejection
  was reproduced, corrected and retried successfully. Mixed Section Auto layout
  returned `contained:true` from rendered node/frame bounds.
- Native `super+a`, Color palette and `Use #3DADFF` colored six annotations.
  GET `/api/views/demo-annotations` returned that color on all six; reload
  retained it. Keyboard copy/paste acceptance remains unverified: the browser
  harness reported an empty virtual clipboard. Helper tests and explicit
  duplication do not substitute for that interaction.
- A Bun MCP SDK client connected to the live `/mcp` endpoint, created a table,
  updated/read its cells, rejected deletion at a stale revision, deleted at the
  current revision and asserted the original annotation list was restored.
  The existing configured connector also returned the six demo annotations
  through `annotation_list`; all five annotation tools are in its refreshed catalog.
- `bun scripts/smoke-local-helper.ts structsmith-fork:native-elements` passed
  standalone HTML, authenticated Docker REST, fake host CLI, scoped MCP writes,
  streaming and Stop. No provider calls or credentials were needed.
- HTTP Mermaid import and browser rendering covered native rectangles, diamonds,
  data, documents and cylinders. Reversed mixed-size RL/BT imports overlapped
  before the correction; POST import then GET document returned a 116px gap
  after it. A growing cylinder's measured height now keeps its cap above the title.
  RL/BT connections use inward-facing source/target ports instead of routing
  through the cards. Browser inspection and persisted presentation checks cover both.
- The connected native demo's document/merge label collision was reproduced.
  After widening that fixture's corridor, DOM rectangle checks on all seven
  `Move label` buttons returned no card intersections; warning/error logs were
  empty. Its clearance test catches restoring the original spacing.

The existing service kept its volume and URL. `bun scripts/verify-service-migration.ts
http://127.0.0.1:8092 http://127.0.0.1:8090` compared all five existing workspaces,
documents, snapshots and activity before subsequent demo edits. Rollback data
is retained as `/data/backup-before-native-elements.sqlite` and a stopped
`structsmith-before-native-elements` container. `bun run ui:demo --reset` restores
the expanded baseline after destructive QA. Mobile, native OS color-dialog,
rich text, formulas and exports are outside this acceptance.
An exact final before/after REST comparison of 16 endpoints also retained all five
workspace lists, documents, snapshot lists and activity after the last image update.

### Shared demo and QA cleanup

The reusable [UI demo](UI_DEMO.md) replaces disposable editor fixtures. Its initial
baseline had 79 elements, 17 relationships and 14 focused views; the native and
annotation cases above extend it. New cases
belong in `scripts/ui-demo-fixture.ts`; repository AGENTS.md points future agents
to its seed/reset command and browser checklist.

- `bun run ui:demo` created the live `structsmith-ui-demo` at revision 2.
  `bun run ui:demo --reset` restored the final baseline at revision 11 after
  comment-resolution and auto-layout exercises, first saving a reset snapshot.
  The real HTTP seed test verifies edit preservation, reset snapshot restoration,
  unrelated-workspace refusal and interrupted-seed recovery guidance.
- Browser `tab.goto(...)` opened all 14 views. Home Open details reached Sections;
  Preview opened Process request, then Validate identity within the same dialog.
  `tab.click([50,200])` dismissed it and retained the Section overview URL.
  Resolve, outside-click and reload on an attached comment retained its resolved
  state. Actual Auto layout on the multiline stress view retained all six cards
  with no console warnings/errors; its fitted text needs zooming.
- Rendered node-bound checks on the corrected catalog, typography, stress,
  Sections, validation and state views found no overlapping peer cards. All three
  connector-routing views rendered six labels each; their measured label bounds
  intersected no cards. Live, Planned and Mixed node/connection labels appeared.
  `tab.dev.logs({levels:["error","warn"],limit:20})` returned `[]`.
- The Bun REST cleanup probe rechecked exact archived documents/revisions before
  each DELETE, received 204 for eleven QA workspaces, then read five remaining
  workspaces. All four retained existing documents matched their fresh pre-cleanup
  baseline exactly. The chooser showed those five workspaces after reload.
  An earlier preflight stopped without deleting anything when the retained v6
  business workspace changed concurrently; its newer content was backed up.

Complete serialized database backups, chat data, all original native documents,
the fresh retained-document baseline and cleanup manifest are under
`~/.local/share/structsmith/backups/20261008-ui-demo/`. Canonical HOA, its backup,
the distinct task/charge v6 workspace and Client Portal remain. Native imports
alone do not restore snapshot/activity history; use the complete database backup
when recovering that history.

New seed/fixture checks killed 23 deliberate mutations: edit/snapshot guards,
coverage/spacing, label clearance and Mixed status tags. A requested 900x700
browser override left the measured viewport at 2186x1351; compact-viewport
acceptance is **unverified** in this pass. A complete browser network trace and
exhaustive gesture/CRUD replay are also **unverified** here. This pass added test
data and tooling, not editor runtime behavior or export work. Existing Biome
schema-version information and the web bundle-size warning remain informational.

### Earlier feature-specific acceptance

Workers exercised disposable QA workspaces against the local fork. Exploration
and the reply-save conflict were independently observed by this audit worker;
Section, color and type observations were supplied by their focused workers.
No canonical portal model was changed for these acceptance checks. AXI failed at
startup because its cached package lacked `@toon-format/toon`; verification used
supported browser fallbacks without installing or repairing the harness.

| Area | Actual interaction or command | Observed result |
| --- | --- | --- |
| Inline expansion | `qaTab.playwright.getByRole('button', {name:'Expand in place', exact:true}).click()`; fresh node DOM | Expand showed only direct children. Nested expansion showed four levels; level four's Expand was disabled with the maximum-level message and level five was absent. Collapse removed descendants. |
| Detail navigation | Open details, Remember checkbox, choose A, Back, Open details | A/B chooser appeared; remembered A landed directly after Back. Earlier producer reload evidence remains recorded below. |
| Attachment slots | Source First quarter, Target Third quarter, Undo, reload; GET workspace document | DOM contained three source and target slots on each side. Saved `sourceSlot:0,targetSlot:2`; Undo restored target center. Reload retained source first quarter and target center at revision 39. |
| Reply save failure | Edit reply at revision 39; guarded REST command advances to 40; Save changes | Conflict toast appeared and exact draft text remained. GET document retained original reply and comment at revision 40. Cancel restored the saved reply. Evidence: `/tmp/structsmith-comment-conflict-preserved.png`. |
| Sections | Native title edit, frame drag, corner resize, drag-out/in membership, double-click and Fit section to contents in disposable Section QA | Rename persisted; frame and member moved by the same 35/17 pixels. Resize changed 276x152 to 326x192; fit restored 276x152. Drag-out emptied old membership; drag-in added Alpha to the new Section. Fit shrank 420x280 to 276x152. Locked members disabled Fit; hidden members remained included. REST readbacks covered revisions 23-33; console warning/error logs were empty. |
| Fit clearance | Final-image Chrome at measured 900x700: top Fit, F, bottom Fit, reload, Auto layout | Cards ended at y=580 while toolbar began at y=600. With both panels open, toolbar started at x=217.71 after controls ended at x=210.72. Earlier toolbar obstruction was corrected and rechecked. |
| Colors | Section/card and ordinary/merged connector color, persist/reset/undo; copy/paste/duplicate | Saved colors retained/reset through the UI. Final duplicate carried `#12AB34`; GET document stored that color for source, paste and duplicate. Native OS picker interaction was not exercised. |
| Type and shapes | Action to Decision, Undo, Redo, reload; Auto layout on three cloned portal views | Original ID/comment survived. Views with 5/9/5 nodes showed zero measured overlaps. A cylinder with saved height 200 rendered `offsetHeight:200` and `viewBox:220x200`. |
| Console | `qaTab.dev.logs({levels:['error','warn'],limit:10})` plus focused workers' final log checks | No warning/error entries on the exercised exploration, conflict and final fit paths. This is scoped console evidence, not a full request trace. |

Final integration commands supplied by the main task: `bun run check`,
`bun run typecheck`, `bun run build`, `bun run build:site` and `bun run build:local`
exited 0. `bun test` reported **269 passed, 0 failed, 1,531 assertions across
53 files**. Check reported the existing Biome schema 2.5.12/CLI 2.5.14 informational
mismatch; build retained its existing large-bundle warning.
`dist/local-helper/structsmith-local-darwin-arm64 --help` and `--version` returned
successfully (version 1.13.0). `bun scripts/smoke-local-helper.ts
structsmith-fork:editor-final` exercised HTML, authenticated Docker REST,
host CLI, scoped MCP, streaming and Stop successfully. These gates do not imply
mobile, native color-picker, export or identity acceptance.
Historical suite counts below describe their stated earlier builds.

## Readable cards and centered previews

Chrome acceptance used `tab.playwright.getByRole(...).press('Enter')`, native
`tab.click(...)`, `tab.pressKey(null, 'Escape')`, fresh DOM and bounding rectangles
against Vite on port 5178 proxying the existing local service. In the actual portal
overview, Prepare and replay opened one dialog; Prepare replay and Resolve and
submit drilled deeper, an ancestor breadcrumb returned, and Escape restored the
exact overview viewport transform. Full-view handoff reached the editable scoped
diagram. Preview handles were hidden and labels remained present without selection.

The disposable `qa-readable-titles-and-preview-ddz07g` exercised long titles and
multiline descriptions in custom, action, decision, outcome and database cards.
DOM measurements found zero text overflows beyond a two-pixel rounding allowance.
A narrow Section reproduced initial heading clipping: title top 124.94 versus
canvas top 168.99. After the fit/readiness correction, its initial title top was
217.27. The editor's top Fit action also retained its entire title above the frame.
Saved diagram coordinates were not rearranged for this acceptance.

Some existing portal connector labels overlap cards in saved layouts (Prepare
replay's `targets` and `submit replay`). Preview preserves that geometry; this
is a remaining saved-layout readability issue. Mobile acceptance and exports
were not exercised. Hot reload produced React DevTools/createRoot and node-type
warnings; the final production container is checked separately.

The final image runs at port 8090. The actual portal preview supported drill-down,
Back, Escape and an unchanged overview transform. The long-text fixture's initial
and bottom-button fits retained its entire Section heading, with zero measured
text overflows. Zoom changed its viewport; outside-click dismissed its dialog.
After reloading the final build, `tab.dev.logs({levels:['error','warn']})` returned
no new entries. All 15 workspace documents matched the pre-restart REST capture.
`/health` returned database/MCP `ok`; the served `index-BuMuEsbG.js` matched the
local build. `bun run test` recorded 283 passing tests and 1,625 assertions;
the final bounds-only regression run recorded six passing tests. Biome,
typecheck, web/site/launcher/Docker builds and the compiled local-helper smoke
completed successfully. Remaining build notices are the existing Biome schema
version, bundle-size and Docker `AUTH_MODE` naming warnings.

## Historical verification evidence

The earlier exploration build `e7ff50c` recorded `bun run typecheck` exit 0 and
`bun run test`: **248 passed, 1,383 assertions**. The subsequent `sections-zoom2`
producer recorded `bun run check` and `bun run typecheck` exit 0, **258 tests and
1,449 assertions**, and a successful Docker build. Its integrated browser run
found React error 185 from an unstable mutation object dependency; changing the
dependency to the stable `mutate` function corrected that earlier report.
`bun test apps/web/src/features/canvas/commandWheel.test.ts` recorded one test,
ten assertions and seven caught deliberate mutations. It protects wheel math;
hardware Cmd+scroll/pinch were separately confirmed by the user.

| Earlier exploration area | Producer interaction | Observed result |
| --- | --- | --- |
| Hidden-default sidebars | Reload, buttons, `super+b` / `super+alt+b` | Both panels began at width zero with `aria-hidden=true`, reopened at 242.828/281.156 pixels, then collapsed through shortcuts. |
| Toolbar and legend | Top legend click and rendered control inspection | Separate legend; bottom controls measured 48 pixels tall and at least 64 pixels wide. |
| Dependencies/resources | Scenario worker inspected navigation and resource anchors | Dependency and validated resource links had anchors; external navigation remained unaccepted. |
| Tag focus | Scenario worker selected Important | Matching merged relationship remained visible. |
| Scenarios | Edit/reload/playback; repair one stale scenario and delete another | Arrival path/label opacity 1; other paths 0.25. Independent stale repair retained the other stale scenario. |
| MCP Sections | Refreshed catalog and existing connection `workspace_inspect` | 48 tools listed; schema included `sectionFrames`; inspection succeeded. |

The earlier main task recorded these end-to-end interactions against the rebuilt local
service on `http://127.0.0.1:8090`. This documentation worker inspected their source
and recorded the producer's results; it did not independently repeat the browser run.

| Area | Actual producer evidence | Observed result |
| --- | --- | --- |
| Sidebar controls | `qaTab.click(...)` and `qaTab.pressKey(...)` using buttons, Cmd+B and Cmd+Alt+B | Model/Inspector widths collapsed from 243/281 pixels to zero and reopened at the same widths. This earlier build opened both on reload. Buttons were at the canvas navigation edges with stateful Show/Hide labels. |
| Desktop comments and panel buttons | Main task inspected the default 1280-pixel viewport | Pin popover bounds were 320x224 inside the canvas, without background dimming. With panels collapsed, 32-pixel toggle buttons remained at x=9 and x=1239. |
| Final image comment recheck | Browser queried Edit reply text and Reply text, edited/saved a reply and inspected a long thread | Each accessible label resolved to exactly one control. A 320x520 popover contained a scrolling body (984-pixel scroll height, 348-pixel client height); the reply composer ended at y=659 and popover at y=708 inside a 720-pixel viewport. |
| Final image sidebar/console recheck | Buttons, native `super+b`/`super+alt+b`, then `qaTab.dev.logs({levels:["error","warn"],limit:10})` | Model/Inspector reopened at 242.828/281.156 pixels with Hide labels. The warning/error query returned `[]`. |
| Canvas gestures | `qaTab.scroll(...)` on two diagrams | Both axes panned without zoom. Shift+wheel, Cmd+wheel and pinch are separately user-confirmed hardware gestures. |
| Comment creation and CRUD | `qaTab.pressKey(null, "c")`, `qaTab.click([425, 545])`, text fill/Post, then comment and reply message menus | Created a pin; edited its original text; posted, edited and deleted a reply. Resolve hid the pin; Show resolved and Reopen restored it. Reload preserved the thread. |
| Escape and conflict protection | Browser opened thread deletion confirmation; an actual Executor `comment_reply_create` added a reply at revision 52 before confirmation | Menu Escape and confirmation Escape retained the thread. Stale confirmation produced `REVISION_CONFLICT`, canceled the dialog and retained both replies. Fresh confirmation changed pins from 3 to 2; Undo restored the parent and both replies; Redo returned to 2 pins. |
| Native connector and label drag | `qaTab.drag([329, 346], [329, 401])`, then `qaTab.drag([352, 401], [392, 461])` | Connector endpoints stayed at (672.5, 192) and (915.5, 192), while the horizontal leg moved to y=340.7003. Label moved 40 screen pixels horizontally while screen y stayed 397.320861. Reload retained the route and label offset (108.1457, 0); four labels remained visible without selection. |
| Three auto-layout pages | Actual Auto layout button clicks on Home, Prepare replay and Charge approval | Home showed 13 nodes/8 labels; Prepare replay 4/3; Charge approval 7/6. Diagram bounds fit after animation. Home fit at zoom 0.226 with both sidebars, so its details need zooming; this is not a readability certification of the whole graph. |
| MCP comments | Actual Bun MCP Client against `http://localhost:8090/mcp`; existing Executor connection refreshed and used | Eight dedicated comment tools were listed and all CRUD exercised over HTTP. Executor exposed the same eight tools; `comment_list` and `comment_reply_create` used the existing real connection. |

Recorded automated commands:

```sh
bun run check
bun run typecheck
bun run test
bun run build
bun run build:local
bun run build:site
docker build -t structsmith-fork:editor-threads . > /tmp/structsmith-editor-threads-docker.log 2>&1
bun scripts/smoke-local-helper.ts structsmith-fork:editor-threads > /tmp/structsmith-editor-threads-smoke.log 2>&1
dist/local-helper/structsmith-local-darwin-arm64 --help
dist/local-helper/structsmith-local-darwin-arm64 --version
```

The main task reported exit 0 for lint/typecheck and all builds, with `bun run test`
reporting **216 passed, 0 failed, 1,106 assertions**. Docker built
`structsmith-fork:editor-threads`; the helper smoke command exercised that image
successfully. Launcher help/version also returned successfully. Focused source
coverage includes
`tests/auto-layout-regression.test.ts`, `tests/boundary-movement.test.ts`,
`tests/view-comments.test.ts`, `packages/mcp/src/comments.test.ts`,
`apps/web/src/features/canvas/relationship-drag.test.ts` and
`apps/web/src/routes/sidebarShortcut.test.ts`. Current exploration contracts also
have `tests/editor-exploration-integration.test.ts`, `tests/exploration.test.ts`,
`tests/dependencies.test.ts`, `tests/scenarios.test.ts` and
`apps/web/src/features/command/shortcuts.test.ts`. Automated checks protect contracts
and geometry; they do not replace rendered visual inspection. To repeat the
focused comment contract checks:

```sh
bun test packages/mcp/src/comments.test.ts packages/mcp/src/server.test.ts tests/view-comments.test.ts
```

The real MCP CRUD probe was a throwaway `bun -e` Client/StreamableHTTPClientTransport
invocation from `packages/mcp`, not a retained script. It created a temporary Home
pin and asserted tool results across comment/reply CRUD and resolution. Existing
Executor `comment_list`/`comment_reply_create` exercised the temporary workspace
copy through the configured connection, rather than replacing that connection.

## Product limits and coverage gaps

- Sidebars start hidden on reload; width restoration is session-only. The status
  overlay resets on reload. Hidden defaults and the separated legend have current
  producer browser evidence above.
- Status uses exact `status:live` and `status:planned` tags. It does not audit
  deployment or enabled flags; Live only can hide neutral/mixed navigation groups.
- Drill-down opens saved scoped views; the chooser can remember a preferred landing
  view for a placement. Inline expansion is temporary and limited to four visible
  levels. Preferred destinations have producer reload evidence; selective nested expansion
  and its four-level cap have October 8 browser acceptance above.
- Merged connectors share presentation from the first represented relationship.
  Route and label edits update every represented relationship in that view.
  Reconnecting is available only when the connection is unambiguous.
- Labels snap to any connector segment and remain horizontal, including on
  vertical legs. Auto-layout clears manual geometry and may still need
  deliberate lanes, offsets or membership changes for a complex graph.
- Canvas comments can attach to saved cards and follow their position; free pins
  remain at canvas coordinates. The thread list searches original text and replies.
  Source includes thread/reply CRUD, resolve/reopen and Show resolved, dedicated
  MCP tools and batch operations. CRUD, reload, resolve and guarded deletion
  have actual browser evidence above. Thread popovers are nonmodal and anchored
  beside the pin, with a reply composer and per-message menus.
  Author identity/ownership, mentions, notifications, reactions and pin clustering
  are absent. Timestamps and edited labels are present for new messages; unread
  markers are local browser state, not cross-client delivery. Legacy notes default to
  unresolved threads with no replies.
- Snapshot undo/redo and revision guards are present. They are not proposal
  branches, semantic merge or a visual before/after comparison.
- A measured 900x700 Chrome viewport has October 8 fit/toolbar acceptance above.
  Mobile/touch behavior and narrower screens remain **unverified**. An earlier
  fallback viewport override did not alter its 1280-pixel rendered width.
- A complete browser network trace is **unverified**: the timing API was unavailable
  (`performance` was undefined in the browser's read-only scope). Actual HTTP MCP,
  health and local-helper smoke checks supplied server/network evidence; they are
  not a substitute for a full browser request trace.
- Section title edit, native movement/resize, membership, fit and locked-member
  refusal have October 8 browser evidence above. Section hide/show controls and
  exhaustive keyboard resizing are outside the selected scope. Existing locking
  behavior is retained.
- Every nested chooser path and network/permission save failures need separate
  end-to-end coverage. Stale thread deletion and reply-edit conflicts preserve
  saved data in the exercised cases; that does not cover every failure path.
  Native OS color-picker interaction, identity/ownership and exports were not
  accepted by this audit.
  Unit coverage of a path is not browser acceptance of it.

Earlier React, settings and group-movement reports are historical bugs. Do not
call them current defects without a new failing browser reproduction.

## Core IcePanel comparison

Orthogonal routing acceptance, 2026-10-08: reproduced the user's real
`mermaid-edge-vqzz65` in `hoa-portal-first-task-and-charge-decisio-r1ml9e`,
view `mermaid-view-g02umu`. The rendered SVG joined `(3838.5,434)` diagonally
to saved `(3876.86,485)`, and saved `(3876.86,82)` diagonally to `(4123.5,105)`.
After the shared geometry repair, a browser DOM check over all 26 rendered paths
reported zero diagonal legs or curve commands. Existing authored layout was
not rewritten. The URL's `view` parameter requires the view ID, not its key;
choosing Imported Mermaid in the view menu loaded the intended canvas.

CUA browser acceptance on the shared UI demo exercised endpoint movement,
reload persistence, segment dragging, label dragging onto a vertical leg,
Undo and Redo. The label remained horizontal at route coordinate
`(439.927,1104.04)`. Curved demo: six of six paths retained curve commands;
straight demo: six paths, zero multi-segment or curved paths. Console warning/error
queries returned empty lists. Browser request capture was unavailable through
the active CUA API. `bun run ui:demo --reset` saved a snapshot and restored the
shared baseline after the interaction tests.

Commands: `bun run test` returned 294 passes, zero failures;
`bun run typecheck`, `bun run check`, `bun run build` and Docker build succeeded.
Six mutations covering raw route rendering, repair bypass, endpoint axes,
redundant handles and input mutation were caught by the focused regression tests.
Biome reports an existing schema-version information notice; Vite reports the
existing bundle-size warning. No exports or obstacle-avoidance routing were tested.

### Native element coverage

Read-only comparison refreshed on 2026-10-08 against live official FigJam,
IcePanel and OMG UML documentation. Local evidence:
`packages/contracts/src/enums.ts`, `packages/contracts/src/model.ts`,
`packages/domain/src/presets.ts`, `packages/domain/src/node-shapes.ts`,
`CreationToolbar.tsx`, `ElementPalette.tsx`, and `ScenarioPanel.tsx`.
The first five additions below are now implemented, with acceptance above.
Code blocks remain a backlog item; this is not full product parity.

| Priority | Native addition | Purpose and ownership |
| --- | --- | --- |
| 1 | Text block | Headings, legends and explanatory paragraphs. View-owned annotation; wrap at a chosen width and grow vertically. |
| 2 | Table | Decision matrices, account outcomes and field mappings. View-owned annotation with editable rows/cells and spreadsheet paste. |
| 3 | Note / sticky note | Visible questions and assumptions. View-owned annotation, distinct from comment discussion threads. |
| 4 | Data / document artifact | Rosters, ledgers, evidence and charge drafts. Shared semantic objects when connected or reused; labels must distinguish data from processing steps. |
| 5 | Start, end, fork, join, merge | Workflow control: process termination, concurrent branches and alternative convergence. Shared workflow nodes; Outcome remains a business result. |
| 6 | Code block | SQL, JSON and examples. View-owned annotation with monospace text. |

Annotations should follow the view ownership of Sections, be available through
REST/MCP, and avoid adding decorative headings or tables to the architecture
hierarchy. Connected data objects should follow shared model ownership. Use
existing roles before adding architecture kinds. Custom stays an escape hatch;
imports and the creation palette should offer native equivalents for routine work.
Mermaid import now infers native shapes and preserves explicit type metadata.
The earlier all-Custom import behavior was reproduced before this implementation.

**FigJam:** confirmed absent canvas objects include text, tables, sticky notes,
code blocks, images/video/GIF, drawing/highlighter and link previews. Extra
flowchart shapes include input/output, document and manual input. Stamps,
stickers and mind maps are lower priority for these diagrams. Existing decision,
database and subprocess shapes cover part of the shape catalog.
Sources: [Text](https://help.figma.com/hc/en-us/articles/1500004291281),
[Tables](https://help.figma.com/hc/en-us/articles/12583849250199),
[Sticky notes](https://help.figma.com/hc/en-us/articles/1500004414322),
[Code blocks](https://help.figma.com/hc/en-us/articles/4410965151127),
[Shapes](https://help.figma.com/hc/en-us/articles/1500004414382).

**IcePanel:** Actor, System, App, Store and Component already map to Person,
Software System, Container roles and Component. The material object gap is
reusable model Groups with membership across diagrams; our Sections are visual
frames owned by one view. Keep those concepts separate. Domains and connection
Via objects are further organization/presentation capabilities. Queue nodes
already cover the immediate queue use case. Ordered scenario playback already
exists; alternative/parallel flow storytelling is broader than the current
linear scenarios. Sources: [Modelling](https://docs.icepanel.io/core-features/modelling),
[Diagramming](https://docs.icepanel.io/core-features/diagramming),
[Groups](https://docs.icepanel.io/core-features/modelling/groups),
[Flows](https://docs.icepanel.io/visual-storytelling/flows).

**UML:** practical gaps are notes, explicit control nodes and data artifacts.
Responsibility swimlanes can build on Section layout; timer/wait and send/receive
events are later additions. Database cylinders and double-sided subprocesses
are common architecture/flowchart conventions, not normative UML datastore or
call-activity symbols. Class compartments, inheritance/composition/multiplicity,
sequence lifelines and state-machine transitions need dedicated diagram modes
and relationship semantics; a generic box or styled arrow is insufficient.
Source: [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/PDF),
notes section 7.2.4, control nodes 15.3.4, objects 15.4.4, swimlanes 15.6.4,
actions 16.2.4 and artifacts 19.3.4.

### Earlier capability audit

Read-only comparison against official docs fetched live on 2026-10-07 with
`search_service_web_run`, plus the fork's current source. **Priorities are
[INFERENCE] for these portal diagrams**, not promises of full IcePanel parity.
Implementation state below describes current source, not browser acceptance.
The priority numbering records the earlier review and is not a new work queue.

`gh issue list -R noamsiegel/StructSmith --state all --limit 100` reports that the
fork has issues disabled. The upstream queue has open [#102](https://github.com/dziksu/StructSmith/issues/102)
(presentation), [#103](https://github.com/dziksu/StructSmith/issues/103) (endpoint
sides), [#104](https://github.com/dziksu/StructSmith/issues/104) (labels),
[#105](https://github.com/dziksu/StructSmith/issues/105) (workflow semantics), and
[#106](https://github.com/dziksu/StructSmith/issues/106) (milestone timelines).
Closed [#54](https://github.com/dziksu/StructSmith/issues/54) and
[#66](https://github.com/dziksu/StructSmith/issues/66) cover multi-select/copy and
Mermaid import. This audit creates no issues and does not duplicate that work.
Open upstream status does not mean a capability is missing from this fork.

Already present: reusable semantic objects, scoped drill-down with Back and
breadcrumbs, titled auto-sizing groups, saved connector presentation, snapshots,
revision guards, global search, live/planned status overlays and native workflow
kinds. Thread/reply CRUD, resolve/reopen and dedicated comment MCP tools also
have recorded browser/HTTP acceptance above.

| Priority | Useful capability | Fork state and smallest next step | Official and local evidence |
| --- | --- | --- | --- |
| 1 | Preferred detail landing view | **Implemented in source:** chooser can remember a destination for the active view's placement; stale preferences fall back to normal discovery. Producer remembered/reload evidence above. | [Custom zooming](https://docs.icepanel.io/core-features/diagramming); [DetailViewDialog.tsx](../apps/web/src/features/navigation/DetailViewDialog.tsx), [detail-views.ts](../packages/domain/src/detail-views.ts). |
| 2 | Dependencies and where used | **Implemented in source:** inspector derives incoming/outgoing relationships, descendant context and containing-view links. Producer inspected navigation anchors. | [Dependencies](https://docs.icepanel.io/core-features/dependencies-view); [DependencyPanel.tsx](../apps/web/src/features/inspector/DependencyPanel.tsx). |
| 3 | Tag focus with connected context | **Implemented in source:** matching objects/connections keep muted immediate neighbors and parent context. Producer exercised Important tag with a merged relationship. | [Tag focus](https://docs.icepanel.io/visual-storytelling/perspective-tags); [tagFocus.ts](../apps/web/src/features/canvas/tagFocus.ts). |
| 4 | Ordered scenario walkthrough | **Implemented in source:** named sequences reference existing elements/connections in the view, optional arrival connections and Next/Back/Stop playback. Producer CRUD/reload/playback/stale-repair evidence above. | [Flows](https://docs.icepanel.io/visual-storytelling/flows); [ScenarioPanel.tsx](../apps/web/src/features/scenarios/ScenarioPanel.tsx), [scenarios.test.ts](../tests/scenarios.test.ts). |
| 5 | Selective expansion in place | **Implemented in source:** temporary expansion of existing children, limited to four visible levels; saved view membership is retained. Nested four-level browser acceptance above. | [External-scope expansion](https://docs.icepanel.io/core-features/diagramming); [InlineExpansion.tsx](../apps/web/src/features/navigation/InlineExpansion.tsx), [exploration.test.ts](../tests/exploration.test.ts). |
| 6 | Multiple attachment slots | **Implemented in source:** three source/target attachment slots per side, defaulting to center. Browser save/Undo/reload acceptance above. | [Connection points](https://docs.icepanel.io/core-features/diagramming); [ConnectionHandles.tsx](../apps/web/src/features/canvas/ConnectionHandles.tsx), [RelationshipPresentationEditor.tsx](../apps/web/src/features/inspector/RelationshipPresentationEditor.tsx). |
| 7 | Implementation and runbook links | **Implemented in source:** element/relationship property fields with validated HTTP(S) Open actions. Producer inspected resource anchors; external navigation acceptance remains pending. | [Object details](https://docs.icepanel.io/core-features/diagramming); [ResourceLinks.tsx](../apps/web/src/features/inspector/ResourceLinks.tsx). |

Use the existing command palette for search, boundaries for groups and snapshots
for rollback. [Drafts](https://docs.icepanel.io/future-state-design/drafts) and
[version comparison](https://docs.icepanel.io/future-state-design/versioning) are
separate capabilities, but have lower value here until simultaneous proposals
need isolated changes and review. Tags continue to describe status in one
functional hierarchy. Milestone timeline work is already tracked in #106.

## Connector label clearance acceptance (2026-10-09)

Reproduced on the shared demo before editing: dragging its long connector label
onto the target card made `document.elementFromPoint` return card content at the
label center. Labels were on layer 15, below cards on layer 20.

The shared editor/preview renderer now measures label boxes and group headers,
reserves eight canvas pixels around cards, annotations, headers and earlier labels,
and chooses the nearest clear route position. If the route cannot fit the label,
a dotted leader identifies its nearby position. Leaders are masked beneath group
headers. Saved card coordinates, connector bends and label-offset intent remain
unchanged by clearance calculation.

Browser acceptance used `labelTab.drag` and
`labelTab.playwright.evaluate(scanLabelClearance)`, measuring every label rectangle
against cards, annotation rectangles, actual group headers and other labels,
including eight pixels scaled by the viewport zoom. Results: zero clearance
violations on `demo-label-clearance`, orthogonal/curved/straight connector views,
and the read-only connector preview. The crowded fixture has six labels, 16px
card gaps, a note and a measured two-line Section header (44px plus 4px margin).
Dragging labels into cards, moving cards through labels, Undo/Redo, a multilingual
97px-tall label, reload and Auto layout retained zero violations. The final
port-8090 image repeated the label-into-card gesture with zero violations and no
console warnings/errors. [Screenshot](screenshots/connector-label-clearance.jpg).

Verification commands: `bun run check`, `bun run typecheck`, `bun run test`
(346 passing), `bun run build`, `bun run build:local`, `bun run build:site`,
and `docker build -t structsmith-fork:label-clearance-final .`.
Focused solver/header/fixture tests passed; intentional width, padding, interval,
projection, header-height and misplaced-note mutations failed and were restored.
The Impeccable detector flagged the existing SVG `stroke-width` transition as a
box-layout transition; it does not change box layout. Existing schema-version,
large-bundle and Docker AUTH_MODE-name advisories remain.

A native MCP SDK client successfully called `workspace_list` at the unchanged
`http://127.0.0.1:8090/mcp` endpoint. REST document comparisons around cutover
reported all six workspace documents identical. The same data/agent-chat volume
is mounted and the original container is retained for rollback. The dedicated UI
demo was snapshot/reset after destructive exercises; real diagrams were not edited.
Network tracing was unavailable in the browser fallback; REST and MCP were checked
directly. Exports, mobile and performance on very large graphs were not tested.

## Connector endpoint acceptance (2026-10-09)

Reproduced before editing: endpoint targets shrank with canvas zoom and dragging
to another object did not reconnect the relationship. The existing presentation
schema and shared editor/preview edge renderer now support arbitrary border
fractions and loose canvas points. No dependency or separate connector model was
added. Loose ends detach visually in that view; the semantic relationship remains.
Reconnecting changes the dragged semantic endpoint and presentation atomically.

On deployed port 8090, `finalEndpointTab.drag` moved the data handoff endpoint to
empty canvas. `finalEndpointTab.reload()` retained its saved point
`{x:811.9152542372882,y:523.822033898305}`. A subsequent drag onto another object's
right border saved `targetElementId: demo-edge-target-2`, fraction
`0.603439632061276`, and `targetPoint: null`. REST reads of
`/api/workspaces/structsmith-ui-demo/document` confirmed each result. Endpoint
controls measured 28 screen pixels across. Browser console reads returned no
warnings/errors. The demo was snapshot/reset afterward with `bun run ui:demo --reset`.

Earlier browser exercises covered Undo/Redo, diamond borders, refused
self-connections, moving a former attached object, and Fit with a distant loose
point. Orthogonal, curved, crowded and read-only previews retained visible arrows
and labels; the final straight view measured six labels, eight arrowheads and
zero arrow-label intersections. Orthogonal routes had zero diagonal legs.
Arrowheads render above cards/frames at a constant screen size with a background
outline; close endpoint handles separate so their hit areas remain usable.
[Deployed screenshot](screenshots/connector-endpoints.png).

Verification: `bun run test` reported 364 passing tests, zero failures and 3082
assertions across 68 files. `bun run check`, `bun run typecheck`, `bun run build`,
`bun run build:local`, `bun run build:site`, and the final Docker build succeeded.
Focused mutations caught schema, geometry, reconnection, clipboard, Fit,
short-route, arrow rendering, layout-reset and fixture regressions. Native MCP
SDK catalog inspection exposed border fractions and loose points, and
`workspace_list` succeeded at the unchanged `/mcp` URL. Six workspace documents
were identical around container replacement.

Merged edges are not individually reconnectable; lifted hidden endpoints must
be edited in their detail view. The browser fallback lacked network tracing;
REST/MCP were checked directly. Exports, mobile and very large graphs remain
untested. The native-agent launcher smoke test was not rerun for this canvas change.

## Reference documentation

These links underpin the optional ideas, not claims that the fork implements them:

- [IcePanel diagramming](https://docs.icepanel.io/core-features/diagramming),
  [flows](https://docs.icepanel.io/visual-storytelling/flows), and
  [groups](https://docs.icepanel.io/core-features/modelling/groups).
- [Tags](https://docs.icepanel.io/visual-storytelling/perspective-tags) and
  [dependencies](https://docs.icepanel.io/core-features/dependencies-view).
- [Drafts](https://docs.icepanel.io/future-state-design/drafts) and
  [versioning](https://docs.icepanel.io/future-state-design/versioning).
- [FigJam canvas gestures](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam).
