# Workflow editor fork

This fork extends StructSmith's existing domain, UI, REST and MCP without new
dependencies. Workspace, element, relationship and view IDs are retained.
Build this checkout to run the fork; upstream images do not include these changes.

## Workflow navigation and status

Use **Subprocess** (`kind: workflowGroup`), `action`, `decision`, `outcome`,
`data`, `document`, `start`, `end`, `fork`, `join` and `merge` for workflow behavior and `workflow` views for their diagrams. A Subprocess is a
shared model element with a stable ID, incoming/outgoing connections and child
steps. It uses a compact block with double side lines; inline expansion and saved
detail views reveal its contents. Connect a detail view to its overview object
using `scopeElementId`.
One matching view opens directly; multiple matches show a chooser. **Remember for
this diagram** saves a preferred detail destination for that placement. Back and
breadcrumbs restore the previous viewport and selection. Opening a saved view
makes no model edits; creating a missing detail view requires the creation dialog.

**Sections** organize a view for readers, such as “Inputs,” “Capture” and
“Publication.” They are spacious, lightly tinted frames with outside titles,
stored as custom view boundaries rather than model elements. They have no
connections, expansion or drill-down. Use a Section for visual organization and
a Subprocess for a connected step whose internals deserve their own explanation.

Sections sit at the canvas root or inside another Section. They may contain
Subprocesses and ordinary elements. Subprocesses contain steps and nested
Subprocesses, never Sections. A scoped detail view can have top-level Sections
around its visible steps; this does not change those steps' semantic parentage.
Actions can also contain steps; data, documents and control nodes are leaves. Runtime C4
elements can appear alongside workflow steps. Prefer a readable overview and at
most four navigation levels.

The legacy portal backup's three semantic custom groups were converted in place
to Subprocesses. The migration retained their IDs, children, detail views and
saved presentation; see [the migration inventory](SECTION_MIGRATION_INVENTORY.md).

Tag elements and relationships with `status:live` or `status:planned`. Status
shows text badges and blue solid or purple dashed connections. Relationship tags
win over endpoint inference; otherwise a planned endpoint makes the connection
planned, and two live endpoints make it live. Conflicts and differently tagged
aggregated connections show Mixed. Untagged objects keep their presentation.
Live only filters before overview aggregation. Neutral or mixed objects are not
automatically retained as navigation wrappers.

Live means implemented behavior, not verified deployment or enabled flags.
The tag-focus selector keeps matching objects and connections with muted immediate
neighbors and necessary parent context. It changes visibility, not model membership.
Overlay off restores saved styling. The choice survives workspace navigation
and resets to Status on reload, without editing the model or coordinates.

## Explore without copying diagrams

- **Preview** opens one centered, read-only dialog. Click a Subprocess or its
  Open details action to explore deeper; Back and breadcrumbs navigate within
  the same dialog. Pan and zoom stay local to the preview. Escape, Close, or
  clicking outside returns to the unchanged overview. **Open full view** hands
  the current object to the existing detail-view navigation for editing.
  Saved diagrams retain their coordinates, Sections and connector presentation;
  objects without a saved detail view get a temporary layout without model writes.
- Expand or collapse a selected Subprocess's children in place using its existing model
  IDs. Expansion is temporary, supports at most four visible hierarchy levels and
  does not add those children to the saved view. Use scoped views for durable detail.
- The element inspector lists incoming/outgoing dependencies, including connections
  through descendants, and views using the element. Entries navigate and focus the
  relevant object. These lists derive from the existing workspace model.
- **Scenarios** saves named, ordered steps over objects already in the view, with
  optional arrival connections. A step can reply over the previous step's
  connection (playback draws its arrow reversed without changing the model), so a
  request and its response share one connection; a note step narrates without an
  element. **Add selection** appends the selected element, or a selected
  connection as a message, its reply, or both ends. Create/edit/delete and
  Next/Back/Stop playback share the existing revision guards and snapshot history;
  arrow keys and Esc drive playback, the step counter jumps to any step, and the
  copy-reference button gives a link that opens the walkthrough. Playback focuses
  the current step without duplicating objects or diagrams. Deleting a referenced
  object or connection keeps the scenario for repair: playback marks the step and
  model validation reports `SCENARIO_*` warnings.
- The MCP is self-sufficient for agents, following the AXI principles: server
  instructions say to call `modeling_guide` first. Without arguments it returns
  live workspaces, the call order and a topic index; `topic` returns one slice
  (`workflow`, `model`, `views`, `layout`, `scenarios`, `comments`, `readability`,
  `integrity`, `acceptance`) and `all` the complete reference. Every tool result
  keeps its JSON payload in the first content block and adds a second block with a
  named empty state or aggregate (for example `0 scenarios on view …`, or error,
  warning and info counts) and two to four concrete next calls.
- MCP agents use `scenario_list/get/create/update/delete`, which change one
  scenario at a time, and `reference_resolve` for copied scenario references
  (pass the reference's `viewId`). The modeling guide documents the step rules.
- Element and scenario deep links focus their target after the view's first fit
  instead of being replaced by it. The selection toolbar moves beside canvas
  chrome such as the scenario panel rather than covering it.
- Element and relationship inspectors provide **Implementation** and **Runbook**
  links through `implementation.url` and `runbook.url` properties. Only validated
  HTTP(S) links can be opened; existing unrelated properties are retained.

## Canvas editing

- Shift-click adds or removes objects from the selection; Cmd/Ctrl-click remains
  supported. Drag any selected object to move model objects, annotations and
  Sections together. Nested Sections and already-selected children move once.
  Section titles do not enter rename mode during a modified click.
- Dragging one connected object retains the connector's middle route, adjusting
  its ends. Moving both endpoints together translates their saved bends.
  Existing authored bends remain the saved route; automatic obstacle-repair
  corners are not added to them during movement.
  Automatic orthogonal routes become saved view geometry on the first drag;
  Reset appearance returns them to automatic routing. Positions, annotations,
  Section frames and affected routes save as one undoable change.
- Orthogonal connectors route like FigJam: they approach attached borders from
  outside and keep eight pixels clear of their own source and target cards, but
  cross other cards, annotations, Section titles and connectors instead of adding
  detours. Clear manual routes stay unchanged; end bends that would pass through
  their own card are repaired for display in the editor and previews, including
  existing/imported views. Saved positions and bends are not rewritten.
  Automatic routes use endpoint intent only. If the source and target overlap so
  no clear route exists, a red dashed connector and **Blocked route** label
  explain that the objects need separating. Straight and curved routing retain their existing
  behavior; they do not use orthogonal obstacle avoidance.
- Automatic connector ends share border capacity across incoming and outgoing
  relationships. They fill the center and quarter positions first, then subdivide
  the largest remaining gaps without moving older automatic assignments. Explicit
  saved fractions/slots and loose endpoints stay unchanged; new center-handle
  connections remain automatic. Outer handles and dragged endpoints stay explicit.
  Connection handles render above card content and accept connections from either
  direction. Automatic routes may overlap, so several connectors can share one
  visible trunk. Hovering a path/label, or focusing a label, highlights the full
  connector.
- Moving an endpoint to another border, another object or between attached and
  loose resets its old bends and calculates a new route. Moving along the same
  border preserves the route. Inspector side changes follow the same rule.
  Saved routes render without steps of at most sixteen canvas pixels between legs
  heading the same way, so an endpoint that slides along its border (for example
  when a card grows) or an old saved detour leaves no stale step. Endpoints never
  move; saved bends are not rewritten until the route is edited.
- Connected card dragging uses the pointer before grid snapping to align facing
  border attachments within six screen pixels, with a dotted alignment guide.
  The grid still applies on other axes. Selected objects and Section contents
  share one adjustment; two moving endpoints do not snap to each other. Fractional
  positions survive save and reload. Automatic endpoints on facing borders prefer
  a shared axis within six canvas pixels when neighboring attachments have room.
  Explicit endpoint placements remain fixed until dragged. Endpoint dragging also
  snaps along the visible shape border. An originally automatic jog of at most
  eight canvas pixels may collapse when its endpoints align; authored bends and
  larger obstacle detours retain their saved middle route.
- Cards keep a consistent default width and grow vertically to fit wrapped
  titles, technology and displayed descriptions. Saved heights are minimums,
  so a short saved card cannot clip new text. Wider saved cards remain supported.
  Section and Subprocess frame titles wrap too; frames reserve their title space
  without moving member coordinates. Fit includes outside Section titles.
  Existing crowded layouts may need Auto layout after cards grow; previewing
  never rewrites those layouts. The legacy full-title setting no longer hides text.
- Named connection labels remain visible without clicking or selecting a card.
  The editor and previews measure the whole label and reserve eight canvas pixels
  around cards, annotations, group titles and other labels. Labels slide to the
  closest clear position. Crowded routes use a nearby label with a short dotted
  leader; this does not move saved cards, bends or label-offset intent.
  Drag a label onto any connector segment, including vertical legs; text stays
  horizontal and snaps to the route. Arrow keys move along its leg; Shift moves
  ten units. Default placement favors horizontal legs.
- Select a connector to show segment handles. Drag the line or a handle to move
  that segment while retaining its endpoints. Within six screen pixels of the next
  parallel segment it snaps into line, and the jog between them disappears. Arrow keys move perpendicular to
  the segment; Shift moves ten units. Escape or pointer cancellation discards
  an in-progress drag. A completed gesture is one undoable saved change.
  Segment edits save the authored bends and edited segment, leaving automatic
  obstacle-repair corners derived rather than accumulating them as saved bends.
  Orthogonal routing uses horizontal/vertical legs and sharp right-angle corners,
  including saved routes after endpoint moves. Redundant collinear waypoints are
  omitted from rendering; labels and drag handles follow the same route. Saved
  layout data remains intact until you edit it.
- Select a connector and choose **Reset route**, or double-click its line, to
  clear manual bends and calculate an automatic route. Attachment points, colors,
  arrowheads and label placement remain unchanged. Undo restores the old bends.
  Reset route is disabled when selected connectors already have automatic routes.
- Select an unambiguous connector to reveal its endpoint dots. Each has a
  28-screen-pixel hit area at every zoom; close endpoints separate with guides.
  Drag onto any point along an object's actual outline to attach, onto another
  object to reconnect, or onto empty canvas to leave that end loose. Escape
  cancels; arrow keys move an endpoint freely, with Shift moving ten units.
  Reconnecting to another object changes only that side of the shared model
  relationship. A drop onto its opposite endpoint is refused to prevent an
  invisible self-connection. Lifted hidden endpoints must be reconnected in their
  detail view; moving their visual attachment is still allowed.
- Loose ends are visual, per-view detachment: `sourcePoint`/`targetPoint` retain
  the shared model relationship. `sourceFraction`/`targetFraction` save arbitrary
  outline attachments alongside the legacy side/slot fields. The inspector
  explains this distinction. Auto layout preserves loose ends and resets border
  fractions; copy/paste translates loose ends. Fit includes loose endpoints and
  saved bends, including in read-only previews.
- Arrowheads stay above cards and frames with a canvas-colored outline and a
  consistent screen size. Labels reserve padded space around endpoints as well
  as objects and other labels. Short automatic routes stay in the available gap.
- A merged overview connector updates all represented relationships together in
  the active view. Its endpoints cannot be edited as a single relationship.
- The relationship inspector controls sides, three attachment slots per side,
  arrows, stroke, label position and X/Y offsets. **Reset appearance** clears
  manual geometry and styling.
  Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z redoes.
- Use **Section** in the creation toolbar to wrap selected blocks, or add an empty
  section at the visible canvas center. Click its title to rename it, drag
  the frame to move its members together, and select it to resize with corner/edge
  handles. Drop a block fully inside the body to join; drag it out to leave.
  Sections are view-owned custom boundaries. Manual frame geometry is view-owned
  `settings.sectionFrames`; membership uses boundary members and nested boundaries,
  independently of semantic element parents.
  Double-click the section background/outline, or select it and use **Fit section
  to contents**, to fit member bounds without moving them. Empty sections keep
  their size. Locked members prevent frame resizing and fitting.
- Select a block, Section or connector to reveal the contextual formatting
  toolbar. **Color** offers preset swatches, a custom picker/hex value and reset.
  Colors belong to the active view; explicit colors override status outlines,
  while status badges remain visible. Reset removes only the color override.
  Copy/paste and duplication retain the active view's explicit block colors.
- **Change type** on a selected element reuses its ID and retains content, tags,
  connections, comments and layout. Type changes affect the shared model across
  views; incompatible parent/child types are disabled. Actions use rectangles,
  decisions diamonds, outcomes rounded terminals, databases cylinders and
  Subprocesses double side lines. Content stays upright inside each shape.
  Data uses a parallelogram, documents a wavy lower edge, start/end small
  circle markers, fork/join a bar and merge a diamond. Marker labels sit outside
  the glyph and remain readable. Decisions reserve more room, so existing manual
  layouts may need auto-layout.
- Drag a Section or expanded Subprocess frame to move its members together.
  Both use saved view layout; the Section owns boundary membership and the
  Subprocess retains semantic parentage. A frame with a locked saved member cannot
  move. Quick-look children absent from the saved view remain temporary: they move
  during the gesture, then may reflow around nearby cards when the view is rebuilt
  or reopened. They are not added to the view by moving the Subprocess. Dragging
  the expanded frame across a Section edge updates its visual membership.
  Nested Sections grow their parent frame to keep the child outline and title inside.
- **Auto layout** arranges custom and workflow nodes, including compound groups,
  using the selected algorithm and direction. It clears saved connector bends,
  attachment sides and label offsets, while retaining stroke styling and hidden
  connections. Locked node positions stay fixed. The canvas fits the new layout
  after cards are measured. Undo restores the previous geometry and positions.
- Press **C** or use **Add comment**, then click anywhere on the canvas, including
  a card, to place a thread. In placement mode, Enter places it at the viewport
  center. Write the comment and Post; click its numbered pin to open a compact,
  nonmodal thread popover beside it. Its reply composer stays available; each
  message menu provides Edit/Delete. Deleting the entire thread requires a
  confirmation that captures its revision, so a newer reply prevents deletion
  until you review and confirm again. Resolve hides a pin; **Show resolved** reveals it
  for reading or reopening. Escape cancels placement or an unsaved draft.
  Threads belong to that view, survive reload and use snapshot undo/redo. A pin
  placed on a saved card follows the card using a relative offset; empty-canvas
  pins keep absolute coordinates. Removing an attached card retains the thread
  at its last saved canvas position. The thread list searches original messages
  and replies and can include resolved threads. Concurrent edits display a conflict
  warning and preserve the unsaved text; review the latest thread before retrying.

Comments use the same revision-guarded domain operations through the UI and MCP.
The dedicated tools are `comment_list`, `comment_get`, `comment_create`,
`comment_update`, `comment_delete`, `comment_reply_create`, `comment_reply_update`
and `comment_reply_delete`. Set `resolved` through `comment_update`. Atomic
`model_apply_operations` batches use `addViewComment`, `updateViewComment`,
`deleteViewComment`, `addViewCommentReply`, `updateViewCommentReply` and
`deleteViewCommentReply`. Legacy notes load as unresolved threads with no replies.

New messages carry timestamps and edited labels. Unread markers are local to this
browser, not shared across clients. Threads have no author identity or ownership
controls, mentions, notifications, reactions or pin clustering. Legacy messages
without timestamps remain readable.

Auto-layout is a starting point. Inspect the rendered result for readable labels,
crossings, unintended overlap and useful lanes before accepting a diagram. A
large diagram can fit at a small zoom; zoom into sections or close the sidebars
to read its details.
The settings button beside the view title opens the editable settings dialog;
settings save immediately, and view names save on blur or Enter.

## Text, notes and tables

Use **Text**, **Note** or **Table** in the creation toolbar for context that belongs
only to the active view. These annotations are stored in `settings.annotations`,
not the reusable model: they have no connections, semantic parents or drill-down.
Use connected `data` and `document` elements for reusable evidence or artifacts.
Notes are sticky-style blocks, separate from comment threads and presales records.

Double-click an annotation or use its selected Edit button to edit. Text and notes
support plain multiline text and text size; tables support editable cells and row
and column addition/removal. Paste spreadsheet cells into a table cell to fill a
rectangle, including quoted multiline cells. Limits are 100 rows, 20 columns,
5,000 characters per cell and 100,000 table characters. Tables have no formulas.
Save commits the edit; failed saves retain the draft for retry.

Select annotations to drag, resize, change Color, duplicate, copy/paste or delete.
Content wraps and dimensions grow to keep text readable. An annotation fully
inside a Section joins it; dragging it out removes membership. Section movement
and Fit include its annotations. Undo/Redo and reload preserve saved annotations;
exploration previews show them read-only. Auto layout arranges model objects and
leaves annotation coordinates unchanged.

MCP tools are `annotation_list`, `annotation_get`, `annotation_create`,
`annotation_update` and `annotation_delete`. Writes use the existing revision guard
and snapshots. Atomic batches use `createViewAnnotation`, `updateViewAnnotation`
and `deleteViewAnnotation`; read-only MCP exposes only reads. Native JSON retains
annotations. Mermaid export describes the semantic model and omits annotations;
visual exports remain outside this editor's acceptance scope.

Mermaid flowchart import infers native workflow types from supported shapes and
recovers explicit StructSmith kind/role labels. Unconnected ordinary subgraphs
become view-owned Sections; connected subgraphs become Subprocesses. See the
[import contract](../README.md#mermaid-import) for mapping and round-trip limits.

## Navigation and sidebars

Canvas gestures follow [FigJam's guide](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam):
scroll pans vertically; Shift+scroll pans horizontally; two-finger trackpad
scrolling pans on either axis. Cmd/Ctrl+scroll zooms around the pointer; pinch
zooms as well. Canvas dragging
also pans, and **F** fits the diagram.

The buttons at the canvas navigation edges toggle the Model and Inspector
sidebars. Their labels say Show or Hide for the current state. Cmd/Ctrl+B toggles
Model; Cmd/Ctrl+Alt+B toggles Inspector. Both start hidden on reload; reopening
restores their width during the session. Explicit inspection actions can reveal
Inspector. The diagram legend opens separately from the top navigation.

The bottom-center creation toolbar adds Sections, text, notes, tables, Subprocesses,
actions, decisions and outcomes at the visible canvas center; **More** opens the existing element palette.
Comments stay in the top controls and **C** starts placement. Cmd/Ctrl+/ opens
searchable shortcut help, including gestures and platform-specific modifier names.
The toolbar also exposes shortcut help and supports arrow-key focus navigation.

## Preserve an existing service

Keep the service URL and MCP connection unchanged. The local deployment uses
`http://localhost:8090/mcp`; configured clients continue using that endpoint.
Restarted servers may require a new MCP session.

Back up the complete database using SQLite serialization or its backup API, and
copy agent-chat data too. Native JSON is a secondary backup: it omits snapshot
and activity history, and importing a new workspace remaps IDs.

Run the fork against a data copy on another loopback port first, then compare:

```sh
bun scripts/verify-service-migration.ts http://127.0.0.1:8090 http://127.0.0.1:8092
```

This checks workspace metadata, native documents, snapshot lists and activity,
tolerating only the new null relationship-presentation default. Also open actual
diagrams, drill down and back, edit and reload, and call the existing MCP client.
At cutover retain the original container and volume for rollback. Never run two
writable servers against one SQLite database. Migrations are forward-only; retain
an untouched original volume to return to upstream.

See [the editor audit](WORKFLOW_EDITOR_AUDIT.md) for verification evidence and
remaining coverage limits. Exports are outside this editor acceptance scope.
Use the [shared UI demo](UI_DEMO.md) for repeatable frontend regression checks.
