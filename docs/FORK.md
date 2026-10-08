# Workflow editor fork

This fork extends StructSmith's existing domain, UI, REST and MCP without new
dependencies. Workspace, element, relationship and view IDs are retained.
Build this checkout to run the fork; upstream images do not include these changes.

## Workflow navigation and status

Use `workflowGroup`, `action`, `decision` and `outcome` for process steps and
`workflow` views for their diagrams. Connect a saved detail view to its overview
object using `scopeElementId`. Existing custom groups use the same drill-down.
One matching view opens directly; multiple matches show a chooser. Back and
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
Overlay off restores saved styling. The choice survives workspace navigation
and resets to Status on reload, without editing the model or coordinates.

## Canvas editing

- Named connection labels remain visible without clicking or selecting a card.
  Drag a label horizontally along its connector leg; its vertical position stays
  attached to the leg. Left/Right moves one unit; Shift moves ten. Up/Down cannot
  detach it vertically. Labels on diagonal or curved paths follow their path.
- Select a connector to show segment handles. Drag the line or a handle to move
  that segment while retaining its endpoints. Arrow keys move perpendicular to
  the segment; Shift moves ten units. Escape or pointer cancellation discards
  an in-progress drag. A completed gesture is one undoable saved change.
- A merged overview connector updates all represented relationships together in
  the active view. Reconnecting endpoints is only available for an unambiguous
  connection. Geometry belongs to the view and never changes semantic endpoints.
- The relationship inspector controls sides, arrows, stroke, label position and
  horizontal offset. **Reset appearance** clears manual geometry and styling.
  Cmd/Ctrl+Z undoes; Cmd/Ctrl+Shift+Z redoes.
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
  Threads belong to that view, survive reload and use snapshot undo/redo. Pins
  stay at canvas coordinates rather than following a moved object.

Comments use the same revision-guarded domain operations through the UI and MCP.
The dedicated tools are `comment_list`, `comment_get`, `comment_create`,
`comment_update`, `comment_delete`, `comment_reply_create`, `comment_reply_update`
and `comment_reply_delete`. Set `resolved` through `comment_update`. Atomic
`model_apply_operations` batches use `addViewComment`, `updateViewComment`,
`deleteViewComment`, `addViewCommentReply`, `updateViewCommentReply` and
`deleteViewCommentReply`. Legacy notes load as unresolved threads with no replies.

Threads have no author identity or ownership controls, mentions, notifications,
timestamps, reactions or unread state. There is no thread sidebar or pin clustering.

Auto-layout is a starting point. Inspect the rendered result for readable labels,
crossings, unintended overlap and useful lanes before accepting a diagram. A
large diagram can fit at a small zoom; zoom into sections or close the sidebars
to read its details.
The settings button beside the view title opens the editable settings dialog;
settings save immediately, and view names save on blur or Enter.

## Navigation and sidebars

Canvas gestures follow [FigJam's guide](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam):
scroll pans vertically; Shift+scroll pans horizontally; two-finger trackpad
scrolling pans on either axis. Cmd/Ctrl+scroll and pinch zoom. Canvas dragging
also pans, and **F** fits the diagram.

The buttons at the canvas navigation edges toggle the Model and Inspector
sidebars. Their labels say Show or Hide for the current state. Cmd/Ctrl+B toggles
Model; Cmd/Ctrl+Alt+B toggles Inspector. Reopening restores its width. Reload opens
both sidebars; collapse preferences are not persisted. Cmd/Ctrl+/ opens shortcut help.

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
