# Workflow editor audit

Audit date: 2026-10-07. Scope: interactive HOA workflow editing in this fork;
exports are excluded at the user's request. Behavior is documented in
[FORK.md](FORK.md). The user confirmed the hardware canvas gestures.

## Verification evidence

The main task recorded these end-to-end interactions against the rebuilt local
service on `http://127.0.0.1:8090`. This documentation worker inspected their source
and recorded the producer's results; it did not independently repeat the browser run.

| Area | Actual producer evidence | Observed result |
| --- | --- | --- |
| Sidebar controls | `qaTab.click(...)` and `qaTab.pressKey(...)` using buttons, Cmd+B and Cmd+Alt+B | Model/Inspector widths collapsed from 243/281 pixels to zero and reopened at the same widths. Reload opens both. Buttons are now at the canvas navigation edges with stateful Show/Hide labels. |
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
`apps/web/src/routes/sidebarShortcut.test.ts`. Automated checks protect contracts
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

## Current product limits and coverage gaps

- Sidebar collapse state and the selected status overlay reset on reload.
- Status uses exact `status:live` and `status:planned` tags. It does not audit
  deployment or enabled flags; Live only can hide neutral/mixed navigation groups.
- Drill-down opens saved scoped views. Multiple matches require a chooser;
  expansion in place and a per-placement preferred landing view do not exist.
- Merged connectors share presentation from the first represented relationship.
  Route and label edits update every represented relationship in that view.
  Reconnecting is available only when the connection is unambiguous.
- Labels slide on their current route leg. A purely vertical leg offers no
  horizontal travel. Auto-layout clears manual geometry and may still need
  deliberate lanes, offsets or membership changes for a complex graph.
- Comments stay at per-view canvas coordinates rather than following moved cards.
  Source includes thread/reply CRUD, resolve/reopen and Show resolved, dedicated
  MCP tools and batch operations. CRUD, reload, resolve and guarded deletion
  have actual browser evidence above. Thread popovers are nonmodal and anchored
  beside the pin, with a reply composer and per-message menus.
  Author identity/ownership, mentions, notifications, timestamps, reactions, unread
  state, a thread sidebar and pin clustering are absent. Legacy notes default to
  unresolved threads with no replies.
- Snapshot undo/redo and revision guards are present. They are not proposal
  branches, semantic merge or a visual before/after comparison.
- Narrow viewport acceptance is **unverified**: `viewport.set({width:900,height:700})`
  returned, but the rendered page and screenshot stayed 1280 pixels wide. The
  override was reset; this validates desktop behavior only.
- A complete browser network trace is **unverified**: the timing API was unavailable
  (`performance` was undefined in the browser's read-only scope). Actual HTTP MCP,
  health and local-helper smoke checks supplied server/network evidence; they are
  not a substitute for a full browser request trace.
- Dark-theme visual acceptance, every nested chooser path and network/permission
  save failures need separate end-to-end coverage. Concurrent
  stale thread deletion is verified above; that does not cover every conflict path.
  Unit coverage of a path is not browser acceptance of it.

Earlier React, settings and group-movement reports are historical bugs. Do not
call them current defects without a new failing browser reproduction.

## Core IcePanel comparison

Read-only comparison against official docs fetched live on 2026-10-07 with
`search_service_web_run`, plus the fork's current source. **Priorities are
[INFERENCE] for these portal diagrams**, not promises of full IcePanel parity.
Implementation state below describes source, not browser acceptance.

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
| 1 | Preferred detail landing view | **Partial:** drill-down exists; multiple candidates always require a chooser. Save an optional landing view for this object's placement to reduce repeated clicks. | [Custom zooming](https://docs.icepanel.io/core-features/diagramming); [StudioPage.tsx](../apps/web/src/routes/StudioPage.tsx), [detail-views.ts](../packages/domain/src/detail-views.ts). |
| 2 | Incoming/outgoing dependencies and where-used views | **Partial:** selection highlights visible adjacent edges and the model resolves lower relationships. Add a derived inspector list across the workspace, with direct/lower distinction and links to containing views; reuse relationships rather than draw another diagram. | [Dependencies](https://docs.icepanel.io/core-features/dependencies-view), [model viewer](https://docs.icepanel.io/core-features/model-viewer); [Inspector.tsx](../apps/web/src/features/inspector/Inspector.tsx), [implied.ts](../packages/domain/src/implied.ts), [CommandPalette.tsx](../apps/web/src/features/command/CommandPalette.tsx). |
| 3 | Tag focus with connected context | **Partial:** arbitrary tags can be edited, but only live/planned tags drive the overlay. Let users focus a selected tag while keeping connected neighbors muted, so portal capture, mail and publication can share a diagram. | [Tag focus](https://docs.icepanel.io/visual-storytelling/perspective-tags); [statusOverlay.ts](../apps/web/src/features/canvas/statusOverlay.ts), [graph.ts](../apps/web/src/features/canvas/graph.ts). |
| 4 | Ordered scenario walkthrough | **Partial:** workflows have actions, decisions, outcomes and branches; ordered steps, Next/Back playback and scenario paths are absent. A named sequence over existing IDs could explain capture-to-charge and exception paths without copied diagrams. Reuse #105 rather than reopen basic workflow semantics. | [Flows](https://docs.icepanel.io/visual-storytelling/flows); [enums.ts](../packages/contracts/src/enums.ts), [model.ts](../packages/contracts/src/model.ts), [operations.ts](../packages/contracts/src/operations.ts). |
| 5 | Selective expansion in place | **Absent:** titled groups and scoped views exist, but opening details navigates away. Expand one chosen group's children and collapse them again using existing IDs and view layout; avoid flattening the whole hierarchy. | [External-scope expansion](https://docs.icepanel.io/core-features/diagramming); [DetailNavigation.tsx](../apps/web/src/features/navigation/DetailNavigation.tsx), [graph.ts](../apps/web/src/features/canvas/graph.ts). |
| 6 | Multiple attachment slots on each side | **Partial:** one source and target handle per side, saved side choices and segment dragging exist. Additional per-side attachment slots could separate fan-out without overlapped stems. This extends #103; it does not require a replacement routing engine. | [Connection points](https://docs.icepanel.io/core-features/diagramming); [ElementNode.tsx](../apps/web/src/features/canvas/ElementNode.tsx), [RelationshipPresentationEditor.tsx](../apps/web/src/features/inspector/RelationshipPresentationEditor.tsx). |
| 7 | Clickable implementation and runbook links | **Partial:** descriptions, properties and linked records exist; dedicated validated links and an obvious Open action do not. Link a workflow object to its owning code or operating instructions so readers can verify what the diagram describes. | [Object and connection details](https://docs.icepanel.io/core-features/diagramming); [model.ts](../packages/contracts/src/model.ts), [Inspector.tsx](../apps/web/src/features/inspector/Inspector.tsx). |

Use the existing command palette for search, boundaries for groups and snapshots
for rollback. [Drafts](https://docs.icepanel.io/future-state-design/drafts) and
[version comparison](https://docs.icepanel.io/future-state-design/versioning) are
separate capabilities, but have lower value here until simultaneous proposals
need isolated changes and review. Tags continue to describe status in one
functional hierarchy. Milestone timeline work is already tracked in #106.

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
