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
bun run ui:demo http://127.0.0.1:5173
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
| `demo-connectors`, `demo-connectors-curved`, `demo-connectors-straight` | Routing/stroke variants, bends, slots and label offsets | Labels visible unselected; drag segment/label, Undo/Redo and reload |
| `demo-annotations` | Heading, long/multilingual/empty text, sticky notes, table and Section membership | Create/edit, quoted spreadsheet paste, row/column changes, resize/color, move into/out of Section, group movement/Fit, duplicate/copy/paste, delete, Undo/Redo, reload and read-only preview |
| `demo-native-flow` | Connected data/documents, start/end, fork/join and merge; mixed model/annotation Section on the default layer | Recognizable shapes, attached connectors, readable titles, type switching, Auto layout retains all Section contents |
| `demo-comments` | Open/resolved threads, replies, anchored/free pins | Create/edit/delete/reply, resolve/reopen, outside-click, deletion conflict |
| `demo-states` | Live/planned/mixed tags, explicit colors, locked/hidden items, scenarios | Overlay/focus, color reset, lock refusal, scenario Next/Back/Stop |

For each changed surface, seed or reset, open the relevant view, exercise the
actual interaction, reload, then inspect screenshot, console and request evidence.
Check titles, connector labels, controls and popups for clipping and overlap.
Repeat at a narrower desktop viewport when changing canvas chrome or dialogs.
Reset after destructive exercises so the next session begins with known cases.
Exports, identity and mobile acceptance are outside this baseline's current scope.
