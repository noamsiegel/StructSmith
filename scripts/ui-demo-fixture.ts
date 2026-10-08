import { fileURLToPath } from "node:url";
import {
  type CreateElementInput,
  type CreateViewInput,
  elementKinds,
  elementRoles,
  interactionStyles,
  type LayoutEntry,
  type WorkspaceDocument,
  WorkspaceDocumentSchema,
} from "@structsmith/contracts";
import { createDatabase, DrizzleStore, runMigrations } from "@structsmith/database";
import { createServices, InMemoryEventBus, validateDocument } from "@structsmith/domain";

export const UI_DEMO_WORKSPACE_ID = "structsmith-ui-demo";
const timestamp = "2026-01-01T00:00:00.000Z";

/** A disposable, reproducible editor playground built through the real domain writes. */
export function buildUiDemoDocument(): WorkspaceDocument {
  const database = createDatabase(":memory:");
  try {
    runMigrations(database.sqlite, fileURLToPath(new URL("../migrations", import.meta.url)));
    const services = createServices(new DrizzleStore(database.db), new InMemoryEventBus());
    services.workspaces.create({
      id: UI_DEMO_WORKSPACE_ID,
      name: "StructSmith UI Demo",
      description:
        "Disposable editor fixtures. Reset with bun run ui:demo --reset; never use for real diagrams.",
      mode: "relaxed",
    });
    const add = (input: CreateElementInput & { id: string }) => {
      services.elements.create(UI_DEMO_WORKSPACE_ID, input, { source: "system" });
      return input.id;
    };
    const viewSettings = new Map<string, CreateViewInput["settings"]>();
    const view = (
      key: string,
      input: Omit<CreateViewInput, "id" | "key">,
      entries: LayoutEntry[],
    ) => {
      const id = `demo-${key}`;
      if (input.settings) viewSettings.set(id, input.settings);
      services.views.create(UI_DEMO_WORKSPACE_ID, {
        ...input,
        id,
        key: id,
        elementIds: entries.map((entry) => entry.elementId),
        settings: { showDescriptions: true, boundaryLayer: "custom" },
      });
      services.views.saveLayout(UI_DEMO_WORKSPACE_ID, id, entries);
      return id;
    };
    const grid = (ids: string[], columns = 3, xGap = 540, yGap = 290): LayoutEntry[] =>
      ids.map((elementId, index) => ({
        elementId,
        x: (index % columns) * xGap,
        y: Math.floor(index / columns) * yGap,
      }));
    const destinations = [
      [
        "catalog",
        "Element catalog",
        "Every element kind and role. Check shapes and type switching.",
      ],
      [
        "typography",
        "Text and sizing",
        "Long, unbroken, multiline, CJK and emoji text. No clipping.",
      ],
      [
        "sections",
        "Sections and drill-down",
        "Nested visual frames and semantic Subprocess navigation.",
      ],
      ["connectors", "Connectors", "Labels, bend points, styles, arrows and attachment slots."],
      [
        "comments",
        "Comment threads",
        "Free and attached pins, replies, resolved threads and deletion.",
      ],
      [
        "states",
        "Colors and states",
        "Status tags, custom colors, locked placements and scenarios.",
      ],
    ] as const;
    const homeIds = destinations.map(([key, name, description]) =>
      add({ id: `demo-nav-${key}`, kind: "workflowGroup", name, description }),
    );
    const home = view(
      "home",
      {
        name: "00 - Start here",
        kind: "workflow",
        description:
          "Open a destination to explore. Each focused view is also available in the view selector.",
        settings: {
          preferredDetailViews: Object.fromEntries(
            destinations.map(([key]) => [`demo-nav-${key}`, `demo-${key}`]),
          ),
        },
      },
      grid(homeIds, 3, 430, 330),
    );
    for (const [index, key] of [
      "catalog",
      "typography",
      "sections",
      "connectors",
      "comments",
      "states",
    ].entries()) {
      services.records.create(UI_DEMO_WORKSPACE_ID, {
        id: `demo-check-${key}`,
        kind: "note",
        title: `${index + 1}. ${destinations[index]?.[1]}`,
        contentMd: `${destinations[index]?.[2]}\n\nReset this workspace before and after destructive editor checks. Browser acceptance is required; valid model data alone does not prove visible quality.`,
        status: "confirmed",
        linkedElementIds: [`demo-nav-${key}`],
      });
    }

    const kinds = elementKinds.map((kind) =>
      add({
        id: `demo-kind-${kind}`,
        kind,
        name: kind === "workflowGroup" ? "Subprocess" : kind,
        description: `Element kind: ${kind}`,
        technology: kind === "container" ? "Bun" : null,
        parentId:
          kind === "container"
            ? "demo-kind-softwareSystem"
            : kind === "component"
              ? "demo-kind-container"
              : kind === "infrastructureNode"
                ? "demo-kind-deploymentNode"
                : null,
      }),
    );
    const rolesNav = add({
      id: "demo-nav-roles",
      kind: "workflowGroup",
      name: "Role catalog",
      description: "Open all role variants, including the database cylinder.",
    });
    view(
      "catalog",
      {
        name: "01 - Element kinds",
        kind: "workflow",
        scopeElementId: "demo-nav-catalog",
        settings: { preferredDetailViews: { [rolesNav]: "demo-roles" } },
      },
      grid([...kinds, rolesNav], 4, 540, 300),
    );
    const roles = elementRoles.map((role) =>
      add({
        id: `demo-role-${role}`,
        kind: "container",
        parentId: "demo-kind-softwareSystem",
        role,
        name: role,
        technology: role === "database" ? "PostgreSQL" : "Role variant",
        description: `Container role: ${role}`,
        external: role === "externalApi",
      }),
    );
    view(
      "roles",
      { name: "01b - Element roles", kind: "workflow", scopeElementId: rolesNav },
      grid(roles, 4, 390, 270),
    );

    const typography = [
      [
        "long",
        "A long title that must stay readable without manually resizing the card every time its content changes",
        "TypeScript, React Flow, PostgreSQL and a longer technology string that must wrap",
        "Descriptions grow with content. This deliberately long paragraph checks that cards remain readable and neighboring rows have enough room for the expanded text.",
      ],
      [
        "unbroken",
        "VeryLongUnbrokenIdentifierWithoutAnySpacesToForceSafeWrapping0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "UnbrokenTechnologyName0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "UnbrokenDescription0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      ],
      [
        "multiline",
        "First line\nSecond line\nThird line",
        "Bun\nSQLite",
        "First paragraph.\nSecond paragraph with additional words.\nThird paragraph.",
      ],
      [
        "cjk",
        "住宅管理ポータルの請求明細を安全に取得して確認する長いタイトル",
        "日本語・中文・한국어",
        "账户身份必须在保存之前确认。長い説明文をカードに表示して、文字が切れないことを確認します。",
      ],
      [
        "emoji",
        "🧭 Explore → verify ✅ → return 🏠",
        "🔒 TLS / 🗃️ SQLite",
        "Family emoji 👨‍👩‍👧‍👦 and accents: café, naïve, résumé. Mixed scripts: العربية עברית.",
      ],
      ["short", "Short title", "", ""],
    ] as const;
    const textIds = typography.map(([key, name, technology, description], index) =>
      add({
        id: `demo-text-${key}`,
        kind: index === 0 ? "decision" : index === 1 ? "outcome" : "action",
        name,
        technology,
        description,
      }),
    );
    view(
      "typography",
      { name: "02 - Text and sizing", kind: "workflow", scopeElementId: "demo-nav-typography" },
      grid(textIds, 3, 570, 800),
    );
    const multilineDescription = Array.from(
      { length: 12 },
      (_, index) =>
        `Line ${index + 1}: Preserve explicit line breaks and grow to fit this visible description.`,
    ).join("\n");
    const stressIds = (["action", "decision", "outcome", "custom", "container"] as const).map(
      (kind) =>
        add({
          id: `demo-text-stress-${kind}`,
          kind,
          role: kind === "container" ? "database" : null,
          parentId: kind === "container" ? "demo-kind-softwareSystem" : null,
          name: `${kind === "container" ? "Database" : kind} with multiline description`,
          technology: kind === "container" ? "SQLite" : "Technology\non two lines",
          description: multilineDescription,
        }),
    );
    const tall = add({
      id: "demo-text-tall",
      kind: "action",
      name: "1000px tall saved placement",
      description: "Saved dimensions remain a minimum; visible content must never be cut off.",
    });
    view(
      "typography-stress",
      {
        name: "02b - Multiline shapes and tall card",
        kind: "workflow",
        scopeElementId: "demo-nav-typography",
      },
      [...grid(stressIds, 3, 610, 1700), { elementId: tall, x: 1220, y: 1700, height: 1000 }],
    );

    const sectionItems = [
      add({
        id: "demo-section-input",
        kind: "action",
        name: "Receive request",
        description: "Drag across a Section edge to change membership.",
      }),
      add({
        id: "demo-section-check",
        kind: "decision",
        name: "Ready to process?",
        description: "Nested Sections are visual frames, not workflow steps.",
      }),
      add({
        id: "demo-section-process",
        kind: "workflowGroup",
        name: "Process request",
        description: "Open a semantic Subprocess inside a visual Section.",
      }),
      add({
        id: "demo-section-result",
        kind: "outcome",
        name: "Request complete",
        description: "Outside the nested Section, inside its parent.",
      }),
    ];
    const sectionView = view(
      "sections",
      {
        name: "03 - Sections and drill-down",
        kind: "workflow",
        scopeElementId: "demo-nav-sections",
        settings: {
          preferredDetailViews: { "demo-section-process": "demo-process" },
          sectionFrames: {
            "boundary:demo-section-outer": { x: -60, y: -70, width: 2130, height: 570 },
            "boundary:demo-section-inner": { x: -25, y: -20, width: 1060, height: 390 },
            "boundary:demo-section-empty": { x: 2200, y: 0, width: 160, height: 160 },
          },
        },
      },
      grid(sectionItems, 4, 540, 310),
    );
    services.boundaries.create(UI_DEMO_WORKSPACE_ID, {
      id: "demo-section-outer",
      viewId: sectionView,
      kind: "custom",
      layer: "custom",
      name: "Request lifecycle",
      elementIds: ["demo-section-process", "demo-section-result"],
    });
    services.boundaries.create(UI_DEMO_WORKSPACE_ID, {
      id: "demo-section-inner",
      viewId: sectionView,
      parentBoundaryId: "demo-section-outer",
      kind: "custom",
      layer: "custom",
      name: "Preparation with a longer Section title that must wrap without obscuring the contents",
      elementIds: ["demo-section-input", "demo-section-check"],
    });
    services.boundaries.create(UI_DEMO_WORKSPACE_ID, {
      id: "demo-section-empty",
      viewId: sectionView,
      kind: "custom",
      layer: "custom",
      name: "Empty narrow Section with a long heading",
      elementIds: [],
    });
    const processIds = [
      add({
        id: "demo-process-start",
        kind: "action",
        parentId: "demo-section-process",
        name: "Prepare job",
      }),
      add({
        id: "demo-process-validate",
        kind: "workflowGroup",
        parentId: "demo-section-process",
        name: "Validate identity",
        description: "One more level; Home plus three details is the maximum.",
      }),
      add({
        id: "demo-process-end",
        kind: "outcome",
        parentId: "demo-section-process",
        name: "Store result",
      }),
      add({
        id: "demo-process-deliver",
        kind: "workflowGroup",
        parentId: "demo-section-process",
        name: "Deliver result",
        description: "Parallel direct and child relationships lift onto this sibling Subprocess.",
      }),
    ];
    add({
      id: "demo-process-deliver-child",
      kind: "action",
      parentId: "demo-process-deliver",
      name: "Send notification",
    });
    view(
      "process",
      {
        name: "03b - Process request",
        kind: "workflow",
        scopeElementId: "demo-section-process",
        settings: { preferredDetailViews: { "demo-process-validate": "demo-validate" } },
      },
      grid(processIds, 4),
    );
    view(
      "process-alternative",
      {
        name: "03b - Process request: alternate view",
        kind: "workflow",
        scopeElementId: "demo-section-process",
        description:
          "A second detail view exercises the chooser. The parent prefers the main Process request view.",
      },
      grid(processIds, 2, 460, 330),
    );
    const validateIds = [
      add({
        id: "demo-validate-check",
        kind: "decision",
        parentId: "demo-process-validate",
        name: "Identity matches?",
      }),
      add({
        id: "demo-validate-safe",
        kind: "outcome",
        parentId: "demo-process-validate",
        name: "Safe to use",
        tags: ["status:live"],
      }),
      add({
        id: "demo-validate-hold",
        kind: "outcome",
        parentId: "demo-process-validate",
        name: "Withhold result",
        tags: ["status:planned"],
      }),
    ];
    view(
      "validate",
      {
        name: "03c - Validate identity",
        kind: "workflow",
        scopeElementId: "demo-process-validate",
      },
      grid(validateIds, 3),
    );
    for (const [index, [source, target, description]] of [
      ["demo-section-input", "demo-section-check", "Inspect"],
      ["demo-section-check", "demo-section-process", "Yes"],
      ["demo-section-process", "demo-section-result", "Complete"],
      ["demo-process-start", "demo-process-validate", "Verify"],
      ["demo-process-validate", "demo-process-end", "Safe result"],
      ["demo-validate-check", "demo-validate-safe", "Yes"],
      ["demo-validate-check", "demo-validate-hold", "No"],
      ["demo-process-validate", "demo-process-deliver", "Direct handoff"],
      ["demo-validate-safe", "demo-process-deliver-child", "Child handoff"],
    ].entries()) {
      services.relationships.create(UI_DEMO_WORKSPACE_ID, {
        id: `demo-drill-edge-${index}`,
        sourceElementId: source ?? "",
        targetElementId: target ?? "",
        description,
        interactionStyle: "sync",
      });
    }

    const connectorEntries: LayoutEntry[] = [];
    const connectorIds = interactionStyles.map((interactionStyle, index) => {
      const source = add({
        id: `demo-edge-source-${index}`,
        kind: "action",
        name: `${interactionStyle} source`,
      });
      const target = add({
        id: `demo-edge-target-${index}`,
        kind: "outcome",
        name: `${interactionStyle} target`,
      });
      const x = (index % 2) * 1400;
      const y = Math.floor(index / 2) * 800;
      const vertical = index % 4 === 1 || index % 4 === 2;
      const reverse = index % 4 === 2 || index % 4 === 3;
      connectorEntries.push(
        {
          elementId: source,
          x: x + (!vertical && reverse ? 600 : 0),
          y: y + (vertical && reverse ? 500 : 0),
        },
        {
          elementId: target,
          x: x + (!vertical && !reverse ? 600 : 0),
          y: y + (vertical && !reverse ? 500 : 0),
        },
      );
      const id = `demo-edge-${interactionStyle}`;
      services.relationships.create(UI_DEMO_WORKSPACE_ID, {
        id,
        sourceElementId: source,
        targetElementId: target,
        interactionStyle,
        description:
          index === 0
            ? "A longer connector label that must remain visible"
            : `${interactionStyle} handoff`,
        technology: index === 1 ? "Queue / JSON" : null,
      });
      return id;
    });
    const sides = ["right", "bottom", "top", "left"] as const;
    const targetSides = ["left", "top", "bottom", "right"] as const;
    for (const routing of ["orthogonal", "curved", "straight"] as const) {
      const id = view(
        routing === "orthogonal" ? "connectors" : `connectors-${routing}`,
        {
          name:
            routing === "orthogonal"
              ? "04 - Connectors: orthogonal"
              : `04 - Connectors: ${routing}`,
          kind: "workflow",
          scopeElementId: "demo-nav-connectors",
          settings: { relationshipRouting: routing },
        },
        connectorEntries,
      );
      services.views.saveLayout(
        UI_DEMO_WORKSPACE_ID,
        id,
        [],
        connectorIds.map((relationshipId, index) => ({
          relationshipId,
          labelPosition: 0.5,
          presentation: {
            sourceSide: sides[index % sides.length],
            targetSide: targetSides[index % targetSides.length],
            sourceSlot: index % 3,
            targetSlot: index % 3,
            strokeStyle: index % 3 === 0 ? "solid" : index % 3 === 1 ? "dashed" : "dotted",
            strokeWidth: index === 5 ? 3 : 1.5,
            sourceArrow: index % 3 === 0 ? "none" : index % 3 === 1 ? "arrow" : "arrowclosed",
            targetArrow: index % 3 === 0 ? "arrowclosed" : index % 3 === 1 ? "arrow" : "none",
            color: index === 4 ? "#7c3aed" : null,
            labelOffset: index === 2 ? { x: 150, y: 40 } : { x: 0, y: 0 },
          },
          controlPoints:
            routing === "orthogonal" && index === 2
              ? [
                  { x: 165, y: 1150 },
                  { x: 360, y: 1150 },
                  { x: 360, y: 1000 },
                  { x: 165, y: 1000 },
                ]
              : [],
        })),
      );
    }

    const commentElements = [
      add({
        id: "demo-comment-target",
        kind: "action",
        name: "Attached thread",
        description: "Move this card: its comment pin follows. Delete the thread and undo.",
      }),
      add({
        id: "demo-comment-context",
        kind: "custom",
        name: "Free canvas pins",
        description: "Press C and click empty canvas. Try reply, edit, resolve, reopen and delete.",
      }),
    ];
    view(
      "comments",
      {
        name: "05 - Comment threads",
        kind: "workflow",
        scopeElementId: "demo-nav-comments",
        settings: {
          commentPins: [
            {
              id: "demo-comment-open",
              elementId: "demo-comment-target",
              x: 260,
              y: 20,
              text: "Attached unresolved thread. It contains replies so deleting the parent tests complete thread removal.",
              createdAt: timestamp,
              resolved: false,
              replies: [
                { id: "demo-reply-short", text: "Short reply.", createdAt: timestamp },
                {
                  id: "demo-reply-long",
                  text: "A longer reply checks wrapping, spacing and readable thread layout. Edit or delete this reply independently, then undo.",
                  createdAt: timestamp,
                },
              ],
            },
            {
              id: "demo-comment-free",
              elementId: null,
              x: 470,
              y: 360,
              text: "Free unresolved pin without replies. Click outside the popup to dismiss it.",
              createdAt: timestamp,
              resolved: false,
              replies: [],
            },
            {
              id: "demo-comment-resolved",
              elementId: null,
              x: 870,
              y: 340,
              text: "Resolved thread. Show resolved comments to reopen it.",
              createdAt: timestamp,
              resolved: true,
              replies: [
                {
                  id: "demo-reply-resolved",
                  text: "Resolution context remains available.",
                  createdAt: timestamp,
                },
              ],
            },
          ],
        },
      },
      grid(commentElements, 2, 560),
    );

    const stateIds = [
      add({
        id: "demo-state-live",
        kind: "action",
        name: "Live behavior",
        tags: ["status:live"],
        description: "Implemented status badge.",
      }),
      add({
        id: "demo-state-planned",
        kind: "decision",
        name: "Planned behavior",
        tags: ["status:planned"],
        description: "Planned status badge and custom color.",
      }),
      add({
        id: "demo-state-neutral",
        kind: "outcome",
        name: "Unspecified status",
        description: "No status tag. Neutral overlay.",
      }),
      add({
        id: "demo-state-locked",
        kind: "container",
        parentId: "demo-kind-softwareSystem",
        role: "database",
        name: "Locked placement",
        technology: "SQLite",
        description: "Automatic layout must keep this card fixed.",
      }),
      add({
        id: "demo-state-hidden",
        kind: "action",
        name: "Hidden placement",
        description: "Present in model, hidden in this view only.",
      }),
    ];
    services.relationships.create(UI_DEMO_WORKSPACE_ID, {
      id: "demo-state-edge",
      sourceElementId: "demo-state-live",
      targetElementId: "demo-state-planned",
      description: "Next step",
      interactionStyle: "async",
    });
    const stateView = view(
      "states",
      {
        name: "06 - Colors and states",
        kind: "workflow",
        scopeElementId: "demo-nav-states",
        settings: {
          nodeColors: {
            "demo-state-live": "#0f766e",
            "demo-state-planned": "#7c3aed",
            "demo-state-neutral": "#b45309",
            "boundary:demo-state-section": "#2563eb",
          },
          scenarios: [
            {
              id: "demo-scenario",
              name: "Inspect live to planned handoff",
              steps: [
                {
                  elementId: "demo-state-live",
                  title: "Start",
                  description: "The live step is highlighted.",
                },
                {
                  elementId: "demo-state-planned",
                  relationshipId: "demo-state-edge",
                  title: "Planned handoff",
                  description: "Both connector and destination are highlighted.",
                },
              ],
            },
          ],
        },
      },
      grid(stateIds, 3, 540, 600).map((entry) => ({
        ...entry,
        locked: entry.elementId === "demo-state-locked",
        hidden: entry.elementId === "demo-state-hidden",
      })),
    );
    services.boundaries.create(UI_DEMO_WORKSPACE_ID, {
      id: "demo-state-section",
      viewId: stateView,
      kind: "custom",
      layer: "custom",
      name: "Status and color variants",
      elementIds: stateIds.slice(0, 3),
    });

    for (const [id, settings] of viewSettings) {
      services.views.update(UI_DEMO_WORKSPACE_ID, id, { settings });
    }

    const document = services.model.getDocument(UI_DEMO_WORKSPACE_ID);
    for (const items of [document.elements, document.relationships, document.records]) {
      items.sort((a, b) => a.id.localeCompare(b.id));
    }
    for (const entry of document.views) {
      entry.boundaries.sort((a, b) => a.id.localeCompare(b.id));
      entry.elements.sort((a, b) => a.elementId.localeCompare(b.elementId));
      entry.relationships.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
    }
    // Fixed timestamps and explicit IDs keep resets and regression comparisons reproducible.
    for (const item of [
      document.workspace,
      ...document.elements,
      ...document.relationships,
      ...document.views,
      ...document.views.flatMap((entry) => entry.boundaries),
      ...document.records,
    ]) {
      item.createdAt = timestamp;
      item.updatedAt = timestamp;
    }
    document.views.sort((a, b) =>
      a.id === home ? -1 : b.id === home ? 1 : a.name.localeCompare(b.name),
    );
    const parsed = WorkspaceDocumentSchema.parse(document);
    const errors = validateDocument(parsed).issues.filter((issue) => issue.level === "error");
    if (errors.length)
      throw new Error(
        `Invalid UI demo fixture: ${errors.map((issue) => issue.message).join("; ")}`,
      );
    return parsed;
  } finally {
    database.close();
  }
}
