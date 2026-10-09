# Frontend regression workspace

Use one **StructSmith UI Demo** workspace for editor acceptance. Its stable URL is
`http://127.0.0.1:8090/w/structsmith-ui-demo?view=demo-home`.
The Home diagram links to focused test views through ordinary Subprocess details.
Use the view selector for companion cases. Keep real HOA diagrams for realistic
scale checks, rather than creating another copy for each feature.

## Seed and restore the baseline

Start the service, then run from this checkout:

```sh
bun run ui:demo
bun run ui:demo http://localhost:5173
bun run ui:demo --reset
```

The first command creates the dedicated workspace if absent. Repeating it leaves
existing edits intact. `--reset` saves a **Before UI demo reset** snapshot before
restoring the fixture; recover edits through **Snapshots**. Close other editors
of this demo during reset: the existing native import API replaces its document.
Other workspaces are untouched. Set the service's existing `APP_TOKEN` environment
variable if it requires bearer authentication. The command uses REST and never
opens the running service's database directly. It refuses a matching workspace ID
with a different name.

The repeatable baseline lives in [ui-demo-fixture.ts](../scripts/ui-demo-fixture.ts).
Add new regression cases there and update its coverage test instead of creating
another disposable workspace. Fixture checks run in the ordinary `bun run test`
suite. They validate structure; browser acceptance is still required.

## Choose cases by the change

| View key | Cases | Browser acceptance |
| --- | --- | --- |
| `demo-home` | Seven destinations, saved details | Open details, Back, unchanged overview after closing preview |
| `demo-catalog`, `demo-roles` | Every element kind including data/documents/control nodes, and supported roles | Recognizable shapes, selection/type change, readable content |
| `demo-typography`, `demo-typography-stress` | Long titles, multiline descriptions, small saved dimensions, tall card | Full text, Fit, resize, auto-layout, reload |
| `demo-sections`, `demo-process`, `demo-process-alternative`, `demo-validate` | Nested/empty Sections, nested Subprocesses, detail choices | Move contents, membership, resize/fit, preview depth, preferred detail and Back |
| `demo-connectors`, `demo-connectors-curved`, `demo-connectors-straight`, `demo-connector-lanes`, `demo-label-clearance` | Routing/stroke variants, bends, fractional border attachments, loose endpoints, shared-side slot overflow, parallel lanes, pinned manual routes and label offsets | Labels visible unselected; padded clearance from cards, notes, group titles and other labels; drag segment/label/endpoint, reconnect or detach, create a center-handle connection, trace a hovered/focused line, Undo/Redo, Fit and reload |
| `demo-annotations` | Heading, long/multilingual/empty text, sticky notes, table and Section membership | Create/edit, quoted spreadsheet paste, row/column changes, resize/color, move into/out of Section, group movement/Fit, duplicate/copy/paste, delete, Undo/Redo, reload and read-only preview |
| `demo-connection-alignment` | Near-aligned automatic LR/TB attachments, fixed border fractions, different card heights with an 8px grid mismatch, short Section title, legacy detour and a right/right manual connector | Drag near the opposite endpoint axis at normal and 200% zoom; guide appears; aligned axis overrides grid; other axis stays on grid; drag the right/right connector's target to Bottom and check that obsolete bends clear; same-border movement preserves bends; legacy detours never immediately retrace; Undo/Redo and reload retain the result |
| `demo-native-flow` | Connected data/documents, start/end, fork/join and merge; mixed model/annotation Section on the default layer | Recognizable shapes, attached connectors, readable titles, type switching, Auto layout retains all Section contents |
| `demo-comments` | Open/resolved threads, replies, anchored/free pins | Create/edit/delete/reply, resolve/reopen, outside-click, deletion conflict |
| `demo-states` | Live/planned/mixed tags, explicit colors, locked/hidden items, scenarios | Overlay/focus, color reset, lock refusal, scenario Next/Back/Stop |

For each changed surface, seed or reset, open the relevant view, exercise the
actual interaction, reload, then inspect screenshot, console and request evidence.
Check titles, connector labels, controls and popups for clipping and overlap.
Repeat at a narrower desktop viewport when changing canvas chrome or dialogs.
Reset after destructive exercises so the next session begins with known cases.
For Reset route, use the manual right/right connector in `demo-connection-alignment`:
check the selection button and double-click an unselected line, then Undo/Redo and
reload. Only bends should change; attachments, appearance and label placement remain.
For multi-selection, Shift-click model objects, notes and Section headers to
add/remove them; move two connected endpoints, then one endpoint. Check that
the middle route translates only with both endpoints. `demo-connectors` includes
a right/right attachment case. In `demo-sections`, move outer plus nested or empty
Sections and a selected child; verify each moves once. Undo/Redo and reload should
restore positions, frames, membership and connector bends together.
Exports, identity and mobile acceptance are outside this baseline's current scope.
