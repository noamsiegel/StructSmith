# Section migration inventory

Producer inventory, 2026-10-08. Source: `GET http://127.0.0.1:8090/api/workspaces` followed by `GET /api/workspaces/:id/document` for every returned workspace. All 11 responses were inspected before migration. Temporary full documents are `/tmp/section-<workspaceId>.json`; the table is the durable pre-migration result.

Searched `graph.ts`, operation schemas and live documents. Existing view-owned `custom` boundaries fit Sections; legacy custom parent elements do not, because they own semantic children and can scope detail views.

## Complete inventory

| Workspace | Revision | Legacy custom parents | Subprocess elements | Sections | Saved Section frames |
| --- | ---: | ---: | ---: | ---: | ---: |
| `hoa-portal-scrapes-current-20261007` | 136 | 0 | 27 | 19 | 6 |
| `color-qa-oct8-icwnn3` | 17 | 0 | 4 | 1 | 0 |
| `fit-toolbar-acceptance-ctfg9i` | 3 | 0 | 0 | 0 | 0 |
| `exploration-worker-qa-20261008` | 40 | 0 | 5 | 0 | 0 |
| `section-interaction-qa-tzr4s5` | 33 | 0 | 0 | 3 | 3 |
| `type-and-shape-qa-in0289` | 22 | 0 | 1 | 0 | 0 |
| `shape-portal-acceptance-copy-l3ex3j` | 4 | 0 | 27 | 19 | 5 |
| `editor-exploration-acceptance-3qqlyt` | 7 | 0 | 26 | 19 | 0 |
| `editor-verification-temporary-copy-mkmadk` | 64 | 0 | 26 | 19 | 0 |
| `example-client-portal` | 2 | 0 | 0 | 0 | 0 |
| `hoa-portal-first-tasks-and-charges-jdnlr0` | 116 | 3 | 0 | 3 | 0 |

All 83 view-owned Sections have `parentBoundaryId: null`. Therefore no stored Section currently has an illegal non-Section parent. None can be a relationship endpoint: boundary IDs and element IDs are separate contracts. All saved frames refer to real view-owned boundary IDs; none refers to a legacy custom element. Keep their IDs, members, colors, geometry and metadata.

## Migration decisions

The active portal workspace already uses `workflowGroup` for its semantic parents. Its 28 custom elements are leaves, not legacy Sections. Its three acceptance copies likewise have no legacy custom parents. The six remaining non-backup workspaces need no semantic migration.

Only the backup workspace `hoa-portal-first-tasks-and-charges-jdnlr0` has legacy custom parents. All three are subprocesses, established by their behavior descriptions and their already-converted counterparts in the active workspace. None is purely visual framing.

| Legacy ID | Semantic evidence | Preserve |
| --- | --- | --- |
| `mail-summary` | Immediate mail ingestion, event reuse, evidence matching and pending-decision wakeup; scopes `violation-evidence-workflow`; active counterpart `proposed-mail-summary` is a workflowGroup | 2 children, overview placement, scoped view, description/tags |
| `portal-summary` | Daily capture, evidence enrichment and shared completion gate; scopes `source-decision-tree`; active counterpart `proposed-portal-summary` is a workflowGroup | 10 children, overview placement, scoped view, description/tags |
| `shared-summary` | Completion gate, identity checks, duplicate prevention and business actions; active counterpart `proposed-shared-summary` is a workflowGroup | 6 children, overview placement, description/tags |

The three have no direct relationship endpoints and no record references. They appear as saved cards in `two-lane-overview`. This means converting their kind preserves all IDs and every saved coordinate; do not create replacement objects or boundaries. Proposed atomic command, re-read the revision immediately before preview/apply:

```json
{
  "expectedRevision": 116,
  "label": "Differentiate legacy subprocesses from view Sections",
  "operations": [
    { "op": "updateElement", "elementId": "mail-summary", "data": { "kind": "workflowGroup" } },
    { "op": "updateElement", "elementId": "portal-summary", "data": { "kind": "workflowGroup" } },
    { "op": "updateElement", "elementId": "shared-summary", "data": { "kind": "workflowGroup" } }
  ]
}
```

No visual legacy custom parent needs conversion to a Section, so no delete/reparent/create-boundary batch is justified by the live data.

Applied through the existing Streamable HTTP MCP on port 8090 using `model_preview_operations`, then `model_apply_operations`, then `model_validate`. The preview was valid and left the complete document unchanged. The atomic apply advanced revision 116 to 117 and created snapshot `snap-2h9kqu`. A deep comparison of the before/after producer documents confirmed only the three intended kinds, their update timestamps and the workspace revision/update timestamp changed. IDs, parents, tags, descriptions, relationships, records, views, memberships, layouts, colors and settings were retained. `model_validate` returned `valid: true`; the live `modeling_guide` served the new Section/Subprocess rules.

Verification command: `bun /tmp/structsmith-section-migrate.ts`. This was a one-off MCP client, not a second migration implementation. Before/after documents were retained in `/tmp/section-migration-before.json` and `/tmp/section-migration-after.json`; the automatic snapshot is the durable rollback point.

## Renderer issue, separate from data migration

The active portal has 19 Sections: 5 on `portal-home`, 3 on `proposed-source-decision-tree`, and 11 across the 8 `portal-functional-*` detail views. The backup has 3 Sections on `source-decision-tree`. The acceptance copies each retain the same 19 Sections. These are view-owned presentation, even where the view is scoped to a Subprocess.

Current `computeCanvasBoundaries` supplies Section rectangles to `computeBoundaries`, which then includes their complete rectangles in missing model-parent footprints. Thus a canvas can visually draw a Section inside a derived Subprocess frame despite the Section having no semantic parent. Sections are not actually owned by the Subprocess; the presentation conflates the two hierarchies. Do not remove their memberships or reparent semantic elements to cure rendering.

Keep standalone detail-view Sections at the canvas root or below other Sections. Inline Subprocess expansion must not import detail-view Sections into the expanded block. The current `Canvas` source expands model children through `inlineFrames`; it does not import the other view's boundaries, so no such import was found. Suppress enclosing implicit model-parent frames for Section-organized visible members, or put the Subprocess card/frame inside the Section when it is explicitly present. Semantic children keep their model `parentId`. Restore the existing detail-view Section geometry when navigating back to that standalone view.

No user choice is required for the three legacy conversions. A future imported custom parent without behavioral descriptions, scoped views, relationships or equivalent active objects would need classification before conversion; do not infer meaning from its rectangle or name alone.

## Browser acceptance

Native Chrome/CUA against Vite 5178 and the shared 8090 backend:

- Reload and **Fit view** on `portal-functional-evidence`: one root Section and the same five element IDs; all three unwanted enclosing model frames disappeared. The active workspace document remained exactly equal to the producer backup at revision 136.
- `portal-home`: five root Sections, eight Subprocess cards. Scoped Home stages have detail views rather than inline children, so they use **Open details**.
- In disposable workspace `section-subprocess-e2e-oct8-54miv2`, **Expand Prepare**, then `latestSectionTab.drag([728,487],[868,350])`: the saved parent anchor moved, no duplicate frame, crash or new console warnings. Dragging out and back changed only visual Section membership; reload retained the saved anchor and Undo restored it.
- Dragging the outer Section translated its four saved members, expanded frame, temporary children and nested Section by the same `(-122,-87)` delta, leaving the unrelated outcome unchanged. Nested Section outlines and outside titles stayed inside their parent.
- Revision-guarded `setLayout` with `locked:true` disabled both the expanded frame and enclosing Section; a native drag changed no positions or revision. Restoring `locked:false` restored the complete pre-lock document.
- Backup overview retained its three cards as Subprocesses; `source-decision-tree` retained its element IDs and scoped navigation. Its custom Sections remain hidden under its unchanged deployment layer selection.
- Impeccable/CUA expanded and collapsed **6. Inspect results** in light and dark themes. A disposable 74-character title retained its full tooltip and usable 28px controls. Native Tab/Enter operated Collapse and Open details; Cancel retained the document. Console errors/warnings were empty. Producer HTTP checks for HTML, modules, model and document returned 200.

Temporary quick-look children still reflow around nearby saved cards after a rebuild; they are never persisted as new view members. Existing parallel connector-label overlaps in the evidence view predated this change. Mobile and fresh Claude skill discovery were not checked; Claude's fresh-session check was blocked by insufficient credit. Codex discovery, skill lint, both harness links and synchronization hashes were verified.

Final packaged runtime: `docker build -t structsmith-fork:sections-subprocesses-final .`, image `sha256:b14523535dd86b164246f58d380432d390bf731b66ea0e39bda2baf8abc3830d`, healthy on 8090 using `structsmith-fork-data`. Original evidence view and expanded Inspect header retained the verified rendering. CUA `sectionTab.drag([728,487],[868,350])` moved the expanded QA Subprocess without a crash or new console warnings; Undo restored it. `sectionTab.drag([567,422],[427,322])` moved the Section, four saved members, expanded children and nested Section by `(-122,-87)`; Undo restored the complete pre-test views/elements/relationships. HTML, packaged JS and QA document returned HTTP 200. The original active workspace remained exactly unchanged at revision 136.

Final code checks: `bun run check`, `bun run typecheck`, and `bun run test` (276 tests, 1,564 assertions, zero failures); Docker web build, `bun run build:local`, `bun run build:site`, and `bun scripts/smoke-local-helper.ts structsmith-fork:sections-subprocesses-final` succeeded. Hierarchy, import, rendering, movement, nested-title enclosure and frame-measurement mutants failed the intended regression tests before restoration. Biome reports the pre-existing schema-version information; Vite reports the pre-existing bundle-size warning.
