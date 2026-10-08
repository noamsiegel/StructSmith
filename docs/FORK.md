# Workflow editor fork

This fork extends StructSmith's existing domain, UI, REST and MCP. It retains
workspace, element, relationship and view IDs. No additional dependencies are
required.

## Workflow navigation

Use `workflowGroup`, `action`, `decision` and `outcome` to model process steps.
Create `workflow` views and connect them to their overview object with
`scopeElementId`. Existing custom groups also open scoped custom/workflow views.
One matching view opens directly; multiple matches show the existing chooser.
Back and breadcrumbs restore the previous viewport and selection.

Groups and actions can contain steps. Decisions and outcomes are leaves. Runtime
C4 elements retain their kinds and can appear beside workflow steps or connect
to them using ordinary relationships. Group outlines, decision icons and outcome
shapes distinguish their roles without depending on color.
Workflow views include a compact legend using the same icons as their cards.

## Implementation status overlay

Tag elements or relationships with `status:live` or `status:planned`. The Status
control shows text badges and blue solid or purple dashed connectors. Live means
implemented behavior; it does not confirm deployment or feature-flag enablement.
Keep proposed policies distinct from existing components even when they share a
functional detail view. Untagged objects retain their original presentation;
conflicting tags or aggregated relationships with differing statuses show Mixed
status.

Relationship tags take precedence over endpoint inference. Without an explicit
tag, a relationship touching a planned element is planned, and one connecting
two live elements is live. Live only retains explicitly live objects and
relationships whose real endpoints are live, before overview aggregation.
Overlay off restores saved presentation. The control remains selected while
navigating within a workspace and resets to Status on reload; it does not change
model data or saved coordinates.

Opening a saved detail view creates no model edits. A group without a saved view
offers the existing explicit creation dialog; custom leaves without a saved view
do not show an empty navigation shortcut.

## Canvas navigation

Canvas navigation follows [FigJam's mouse and trackpad gestures](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam):
scroll to pan vertically, Shift+scroll to pan horizontally, or use two-finger
trackpad scrolling in either direction. Cmd/Ctrl+scroll and trackpad pinch zoom.
Dragging the canvas still pans; `F` fits the diagram. These gestures are listed
in the keyboard shortcut dialog.

## Preserve an existing service

Keep the service URL and MCP connection unchanged. The local deployment uses
`http://localhost:8090/mcp`; clients configured through Executor continue using
the same connection. Restarted servers may require a fresh MCP session.

Back up the complete database using SQLite serialization or its backup API.
Copy agent-chat data too. Native JSON exports are useful secondary backups, but
omit snapshot and activity history; importing as a new workspace remaps IDs.

Run the fork against a copy of the data on another loopback port first. Before
making intentional diagram changes, compare both services:

```sh
bun scripts/verify-service-migration.ts http://127.0.0.1:8090 http://127.0.0.1:8092
```

The command checks every workspace's metadata, native document, snapshot list
and activity. It tolerates only the new null relationship presentation default.
Also open real diagrams, navigate into details and back, edit a label and reload,
and call MCP through the existing client connection.

At cutover, stop the original service and retain its container and volume for
rollback. Start the fork at the same loopback port with the verified copy. Never
run two writable servers against one SQLite database. Database migrations run
forward only; keep the untouched original volume to return to the old release.

Milestone timelines and expansion in place are separate future work. Drill-down
reuses scoped views; it does not embed all internals into the overview canvas.

## Browser regression check

Use a non-production workspace with a relationship labelled `Evidence`. Select
that label, then run this in the CUA browser runtime with its tab bound to `tab`.
This exercises real keyboard input, concurrent saves and view refreshes. Discarding
measured node dimensions during a refresh unmounts the edge and loses keyboard
focus; retaining them lets ResizeObserver update the card without dropping input.

```js
const label = tab.playwright.getByRole("button", { name: "Move label: Evidence", exact: true });
const offset = tab.playwright.getByLabel("Label offset X", { exact: true });
await label.click();
await tab.getAXState({ emit: false });
const before = Number(await offset.evaluate((element) => element.value));
for (let index = 0; index < 10; index++) await label.press("ArrowRight");
await label.and(tab.playwright.locator('[aria-busy="false"]')).waitFor({ state: "visible" });
await tab.getAXState({ emit: false });
const actual = Number(await offset.evaluate((element) => element.value));
if (actual !== before + 10) throw new Error(`Lost input: expected ${before + 10}, got ${actual}`);
if (await tab.playwright.evaluate(() => document.activeElement?.getAttribute("aria-label")) !== "Move label: Evidence") {
  throw new Error("Label lost keyboard focus during save");
}
await tab.reload();
await tab.getAXState({ emit: false });
await label.click();
await tab.getAXState({ emit: false });
if (Number(await offset.evaluate((element) => element.value)) !== before + 10) {
  throw new Error("Label moves did not survive reload");
}
const saved = before + 10;
await label.press("ArrowRight");
await label.press("ArrowLeft");
await label.and(tab.playwright.locator('[aria-busy="false"]')).waitFor({ state: "visible" });
await offset.fill(String(saved + 20));
await offset.press("Enter");
await tab.getAXState({ emit: false });
await label.press("ArrowRight");
await label.and(tab.playwright.locator('[aria-busy="false"]')).waitFor({ state: "visible" });
await tab.getAXState({ emit: false });
if (Number(await offset.evaluate((element) => element.value)) !== saved + 21) {
  throw new Error("Opposing moves left a stale pending offset");
}
```

Also exercise dragging, both endpoint sides, label position along an orthogonal
path, reset, undo and export. PNG/SVG retain the rendered connector appearance.
Their existing framing can leave wide margins, and dense saved views still need
zoom to read all descriptions. Mermaid preserves workflow semantics, without
promising connector appearance fidelity.
