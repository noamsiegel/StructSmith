# Workflow editor fork

This fork extends StructSmith's existing domain, UI, REST and MCP without new
dependencies. Workspace, element, relationship and view IDs are retained.
Build this checkout to run the fork; upstream images do not include these changes.

## Workflow navigation and status

Use `workflowGroup`, `action`, `decision` and `outcome` for process steps and
`workflow` views for their diagrams. Connect a saved detail view to its overview
object using `scopeElementId`. Existing custom groups use the same drill-down.
One matching view opens directly; multiple matches show a chooser. **Remember for
this diagram** saves a preferred detail destination for that placement. Back and
breadcrumbs restore the previous viewport and selection. Opening a saved view
makes no model edits; creating a missing detail view requires the creation dialog.

Groups and actions can contain steps; decisions and outcomes are leaves. Runtime
C4 elements can appear alongside workflow steps. Titled boundaries and group
outlines provide structure without depending on color. Prefer one functional
hierarchy with a readable overview and at most four navigation levels.

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

- Expand or collapse a selected group's children in place using its existing model
  IDs. Expansion is temporary, supports at most four visible hierarchy levels and
  does not add those children to the saved view. Use scoped views for durable detail.
- The element inspector lists incoming/outgoing dependencies, including connections
  through descendants, and views using the element. Entries navigate and focus the
  relevant object. These lists derive from the existing workspace model.
- **Scenarios** saves named, ordered steps over objects already in the view, with
  optional arrival connections. Create/edit/delete and Next/Back/Stop playback
  share the existing revision guards and snapshot history; playback focuses the
  current step without duplicating objects or diagrams.
- Element and relationship inspectors provide **Implementation** and **Runbook**
  links through `implementation.url` and `runbook.url` properties. Only validated
  HTTP(S) links can be opened; existing unrelated properties are retained.

## Canvas editing

- Named connection labels remain visible without clicking or selecting a card.
  Drag a label onto any connector segment, including vertical legs; text stays
  horizontal and snaps to the route. Arrow keys move along its leg; Shift moves
  ten units. Default placement favors horizontal legs.
- Select a connector to show segment handles. Drag the line or a handle to move
  that segment while retaining its endpoints. Arrow keys move perpendicular to
  the segment; Shift moves ten units. Escape or pointer cancellation discards
  an in-progress drag. A completed gesture is one undoable saved change.
- A merged overview connector updates all represented relationships together in
  the active view. Reconnecting endpoints is only available for an unambiguous
  connection. Geometry belongs to the view and never changes semantic endpoints.
- The relationship inspector controls sides, three attachment slots per side,
  arrows, stroke, label position and X/Y offsets. **Reset appearance** clears
  manual geometry and styling.
  Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z redoes.
- Use **Section** in the creation toolbar to wrap selected blocks, or add an empty
  section at the visible canvas center. Click its title to rename it, drag
  the frame to move its members together, and select it to resize with corner/edge
  handles. Drop a block fully inside the body to join; drag it out to leave.
  Existing custom groups and boundaries retain their IDs. Manual frame geometry
  is view-owned `settings.sectionFrames`; membership uses existing grouping data.
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
  workflow groups subprocess outlines. Content stays upright inside each shape.
  Decisions reserve more room, so existing manual layouts may need auto-layout.
- Drag a titled group frame to move its members together. Existing custom-parent
  frames and view-owned boundaries use the same saved-layout behavior. A frame
  with a locked member cannot be dragged. No second grouping model is introduced.
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

The bottom-center creation toolbar adds sections, workflow groups, actions, decisions
and outcomes at the visible canvas center; **More** opens the existing element palette.
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
