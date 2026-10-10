# Scenario playback review

Date: 2026-10-10. Target: `apps/web/src/features/scenarios/ScenarioPanel.tsx` at
`b466845`, live on the Own user flow scenario "First week: outreach email to first
insight" (8 steps). Method: Impeccable critique, dual assessment (independent design
review, plus detector and browser measurement), and a survey of comparable tools'
live documentation.

## Measured defect

During playback the control row holds eight controls: Back, step jumper, Next, Stop,
Ask agent, Copy reference, Edit and Delete. The panel is a fixed 22rem (352px), so the
row has 328px for about 376px of content. At 1024 and 1440px viewports alike, Delete
ends at x=390 while the panel ends at 368 (22px outside), Edit crosses the padding
and Stop is squeezed to 14px wide. The cause is structural: navigation and
management share one non-wrapping row. A CSS wrap would hide the symptom and keep
the problem.

The Impeccable detector found no anti-patterns in the panel source. Page-level
findings (9–11px canvas labels, clipped React Flow containers) are outside this
target; none clips a panel control.

## Critique

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Step n of N and canvas focus work; no end state; scenario name truncated in the chooser |
| 2 | Match with the real world | 3 | "Over:", "Arrival connection", "Note (no element)" are modelling jargon |
| 3 | User control and freedom | 2 | Esc with the step menu open stops playback and leaves the menu open; Edit/Cancel loses the step |
| 4 | Consistency and standards | 2 | Mixed icon button sizes and tooltips; the step jumper looks like plain text |
| 5 | Error prevention | 3 | Delete is confirmed, but sits in the row the presenter keeps clicking |
| 6 | Recognition rather than recall | 2 | Four unlabeled icons; the jump menu is hidden |
| 7 | Flexibility and efficiency | 3 | Arrows, PageUp/PageDown (clickers), Esc and deep links; no Home/End |
| 8 | Aesthetic and minimalist design | 2 | Eight controls in one row; keyboard hint repeated on every step |
| 9 | Error recovery | 3 | Draft kept on save failure; stale-step message |
| 10 | Help and documentation | 3 | Empty-state and chooser hints teach well |
| **Total** | | **26/40** | Acceptable, with a structural flaw |

**Specificity.** The behaviour is product-specific (the canvas glides to each step,
the arrival connection is named and lit, replies reverse the arrow). The container is
a stock floating card; the presenter's job is not designed for.

**Cognitive load.** Five of eight checks fail: single focus, chunking, grouping,
hierarchy and minimal choices. Next has the same weight as Back, so there is no
primary action. Narration is 12px grey text, hard to read on a screen share.

**Emotional journey.** Strong start (a link opens at step 1 and pans to the card),
smooth middle, flat end: on the last step Next simply disables.

### Priority issues

1. **[P1] Playback and management share one overflowing row.** Playback keeps only
   Back, step progress, Next/Finish and Stop. Ask agent, Copy reference, Edit and
   Delete move into one header overflow menu (`components/ui/dropdown-menu`).
2. **[P1] One layout serves browsing, presenting and editing.** Give the panel modes:
   *Browse* (chooser, create, list); *Playing* (full scenario title with the overflow
   menu, step title, narration at text-sm with a max height, segmented progress, Next
   as the primary button, keyboard hint once); *Editing* in a side sheet with a step
   list and a detail pane (the 8-step draft is 1832px of form behind a 353px window).
3. **[P2] Esc and state bugs.** The capture-phase key handler must ignore keys whose
   target is inside an open menu or listbox. Keep the step index across Edit/Cancel
   and collapse/expand.
4. **[P2] No ending.** The last Next becomes Finish, followed by an end card with
   Restart and Choose another scenario.
5. **[P2] Presenter safety.** Edit and Delete should not be one click from Next while
   presenting.

## How comparable tools present flows

Researched from each vendor's live documentation; sources follow the table.

| Capability | IcePanel Flows | Structurizr | LikeC4 | Ilograph | StructSmith today |
|---|---|---|---|---|---|
| Message / reply / process | Yes, reply flips direction | Message | `->`, `<-`, self-call | `to`, `toAndBack`, `restartAt` | Message, reply, element step |
| One step highlights several things | No (intro/conclusion and parallel paths only) | Yes in static-view `animation` lines | Parallel blocks | Yes: `select`, `highlight`, `hide` lists | No |
| Alternate / parallel paths | Both (paid plans) | Parallel | `alt`, `par`, `opt`, `loop` (experimental) | Sub-sequences | No |
| Jump to another flow or view | "Go to another flow", return or skip | No | `navigateTo` | Sub-sequences, perspectives | No; one view only |
| Intro, conclusion, notes | Intro, Conclusion, Information steps | View description | Markdown notes per step | Slide text, hover descriptions | Note steps |
| Viewer controls | Play mode, arrows, step list, click a step on the canvas | Buttons, `.`/`,`, `p` fullscreen | ←/→/Esc | Next/Back/Finish, leave and resume | Back/Next, arrows, jumper, Esc |
| Others dimmed | Yes | Yes | `style` mutes others | Highlight fades others | Connections only; cards stay bright |
| Share | Link opens the flow; iframe embed | Embeds | React embed | URL per slide | Copyable link to the walkthrough |
| Sequence diagram | Copy as Mermaid, PlantUML, text | Exporter | Live sequence variant | Sequence perspective | No |

Sources: [IcePanel flows](https://docs.icepanel.io/visual-storytelling/flows),
[IcePanel sharing](https://docs.icepanel.io/collaboration/sharing.md),
[Structurizr DSL](https://docs.structurizr.com/dsl/language),
[Structurizr animation](https://docs.structurizr.com/ui/diagrams/animation),
[LikeC4 dynamic views](https://likec4.dev/dsl/views/dynamic/),
[Ilograph sequences](https://www.ilograph.com/docs/editing/perspectives/sequence-perspectives/),
[Ilograph walkthroughs](https://www.ilograph.com/docs/editing/walkthroughs/).

## What a viewer still lacks

1. **A viewer mode.** Hide editing chrome, dim cards that are not in the step (only
   connections dim today), and let viewers click a numbered step badge on the canvas.
2. **Steps that light up several things.** Ilograph's model fits best: the step keeps
   one primary element for the camera and adds an optional highlight set of elements
   and connections. Parallel steps (several arrivals at once) fall out of the same set.
3. **An overview and an ending.** An introduction step that highlights every
   participant, and a finish card.
4. **Leaving the view.** A step that opens a Subprocess's detail view and returns, so
   a scenario can follow the flow into detail views; alternate paths after that.
5. **A sequence diagram.** Copy the scenario as Mermaid `sequenceDiagram`, from the UI
   and MCP.
6. **Read-only sharing.** The copied link opens playback but in the full editor.
