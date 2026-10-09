import { expect, test } from "bun:test";
import { computeLayout, estimateAnnotationSize, estimateLabelSize } from "@structsmith/domain";
import { createTestContext, createWorkspace } from "./helpers";

test("auto-layout excludes hidden descendant relationships before lifting", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "workflowGroup",
      name: "Source",
    }).result;
    const child = services.elements.create(workspace.id, {
      kind: "action",
      name: "Child",
      parentId: source.id,
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "action",
      name: "Target",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: child.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Hidden flow",
      elementIds: [source.id, target.id],
    }).result;
    services.model.applyOperations(workspace.id, {
      operations: [
        {
          op: "setViewRelationships",
          viewId: view.id,
          relationships: [{ relationshipId: relationship.id, hidden: true }],
        },
      ],
    });
    const result = services.views.autoLayout(workspace.id, view.id, "LR").result;
    const positions = new Map(result.elements.map((entry) => [entry.elementId, entry]));
    expect(positions.get(source.id)?.x).toBe(positions.get(target.id)?.x);
  } finally {
    close();
  }
});

const longLabel =
  "Wait for account-matched evidence and reassess the original event without resetting its first waiting time. ".repeat(
    5,
  );

test("legacy hidden-label settings still reserve space for always-visible labels", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "action",
      name: "Source",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "action",
      name: "Target",
    }).result;
    services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
      description: longLabel,
    });
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Label spacing",
      elementIds: [source.id, target.id],
      settings: { boundaryLayer: "custom", showRelationshipLabels: false },
    }).result;
    services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      layer: "custom",
      name: "Both steps",
      elementIds: [source.id, target.id],
    });
    const legacy = services.views.autoLayout(workspace.id, view.id, "TB").result;
    services.views.update(workspace.id, view.id, { settings: { showRelationshipLabels: true } });
    const shown = services.views.autoLayout(workspace.id, view.id, "TB").result;
    const span = (entries: typeof shown.elements) =>
      Math.max(...entries.map((entry) => entry.y)) - Math.min(...entries.map((entry) => entry.y));
    expect(span(legacy.elements)).toBe(span(shown.elements));
  } finally {
    close();
  }
});

test("compound scopes reserve all repeated-pair labels and their full wrapped height", () => {
  const nodes = [
    { id: "a", groupId: "left", width: 220, height: 96 },
    { id: "b", groupId: "right", width: 220, height: 96 },
  ];
  const groups = [{ id: "left" }, { id: "right" }];
  const edges = [{ source: "a", target: "b", label: longLabel }];
  const one = computeLayout(nodes, edges, "TB", "dagre", undefined, groups);
  const both = computeLayout(
    nodes,
    [
      ...edges,
      {
        source: "a",
        target: "b",
        label: "Retain evidence and escalate at the original deadline. ".repeat(3),
      },
    ],
    "TB",
    "dagre",
    undefined,
    groups,
  );
  const gap = (positions: typeof both) =>
    (positions.find((position) => position.id === "b")?.y ?? 0) -
    (positions.find((position) => position.id === "a")?.y ?? 0) -
    96;
  expect(estimateLabelSize(longLabel)?.height).toBeGreaterThan(3 * 13 + 8);
  expect(gap(both)).toBeGreaterThan(gap(one));
});

test("parallel input flows keep their lanes across intervening compound groups", () => {
  const nodes = [
    { id: "assess", groupId: "decisions" },
    { id: "capture", groupId: "capture" },
    { id: "evidence", groupId: "evidence" },
    { id: "mail", groupId: "inputs" },
    { id: "match", groupId: "evidence" },
    { id: "publish", groupId: "publication" },
    { id: "request", groupId: "inputs" },
    { id: "reuse", groupId: "decisions" },
  ];
  const edges = [
    { source: "request", target: "capture" },
    { source: "capture", target: "evidence" },
    { source: "evidence", target: "assess" },
    { source: "mail", target: "match" },
    { source: "match", target: "reuse" },
    { source: "assess", target: "reuse" },
    { source: "reuse", target: "publish" },
    { source: "evidence", target: "publish" },
  ];
  const groups = ["inputs", "capture", "evidence", "decisions", "publication"].map((id) => ({
    id,
  }));
  const positions = new Map(
    computeLayout(nodes, edges, "LR", "dagre", undefined, groups).map((position) => [
      position.id,
      position,
    ]),
  );
  const inputLane = (positions.get("mail")?.y ?? 0) - (positions.get("request")?.y ?? 0);
  const evidenceLane = (positions.get("match")?.y ?? 0) - (positions.get("evidence")?.y ?? 0);
  expect(inputLane * evidenceLane).toBeGreaterThan(0);
  expect([positions.get("capture")?.y, positions.get("evidence")?.y]).toEqual([
    positions.get("request")?.y,
    positions.get("request")?.y,
  ]);
});

test("aligning parallel singleton groups retains separate capture cards", () => {
  const nodes = [
    { id: "request", groupId: "inputs" },
    { id: "mail", groupId: "inputs" },
    { id: "capture", groupId: "capture" },
    { id: "alternative", groupId: "alternative" },
    { id: "evidence", groupId: "evidence" },
    { id: "match", groupId: "evidence" },
  ];
  const edges = [
    { source: "request", target: "capture" },
    { source: "capture", target: "evidence" },
    { source: "request", target: "alternative" },
    { source: "alternative", target: "evidence" },
    { source: "mail", target: "match" },
  ];
  const groups = ["inputs", "capture", "alternative", "evidence"].map((id) => ({ id }));
  const positions = new Map(
    computeLayout(nodes, edges, "LR", "dagre", undefined, groups).map((position) => [
      position.id,
      position,
    ]),
  );
  expect(
    Math.abs((positions.get("capture")?.y ?? 0) - (positions.get("alternative")?.y ?? 0)),
  ).toBeGreaterThanOrEqual(96);
});

test("auto-layout resets connector geometry, preserves styling and undoes as one snapshot", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "action",
      name: "Source",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "action",
      name: "Target",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Manual geometry",
      elementIds: [source.id, target.id],
    }).result;
    const style = {
      color: "#123456",
      strokeWidth: 3,
      strokeStyle: "dashed" as const,
      sourceArrow: "arrow" as const,
      targetArrow: "none" as const,
    };
    services.model.applyOperations(workspace.id, {
      operations: [
        {
          op: "setViewRelationships",
          viewId: view.id,
          relationships: [
            {
              relationshipId: relationship.id,
              hidden: true,
              labelPosition: 0.9,
              controlPoints: [{ x: 999, y: -300 }],
              presentation: {
                ...style,
                sourceSide: "top",
                targetSide: "bottom",
                labelOffset: { x: 400, y: -200 },
              },
            },
          ],
        },
      ],
    });
    const before = services.views.get(view.id);
    const change = services.model.applyOperations(workspace.id, {
      expectedRevision: services.workspaces.get(workspace.id).revision,
      operations: [{ op: "autoLayoutView", viewId: view.id, direction: "LR", algorithm: "dagre" }],
    });
    const after = services.views.get(view.id);
    expect(after.relationships).toEqual([
      {
        viewId: view.id,
        relationshipId: relationship.id,
        hidden: true,
        labelPosition: null,
        controlPoints: [],
        presentation: {
          ...style,
          sourceSide: null,
          targetSide: null,
          sourceFraction: null,
          targetFraction: null,
          labelOffset: { x: 0, y: 0 },
        },
      },
    ]);
    services.snapshots.restore(change.snapshotId as string);
    const restored = services.views.get(view.id);
    expect({ elements: restored.elements, relationships: restored.relationships }).toEqual({
      elements: before.elements,
      relationships: before.relationships,
    });
  } finally {
    close();
  }
});

test("auto-layout encloses fixed annotations and moved model members in the same Section", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const action = services.elements.create(workspace.id, {
      kind: "action",
      name: "Move during layout",
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Mixed Section",
      elementIds: [action.id],
      settings: { boundaryLayer: "custom" },
    }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      layer: "custom",
      name: "Context",
      elementIds: [action.id],
    }).result;
    services.model.applyOperations(workspace.id, {
      operations: [
        { op: "setLayout", viewId: view.id, entries: [{ elementId: action.id, x: 1000, y: 1000 }] },
        {
          op: "createViewAnnotation",
          viewId: view.id,
          data: {
            id: "note",
            kind: "note",
            text: "Fixed note with enough content to grow. ".repeat(30),
            x: 1500,
            y: 1100,
            width: 240,
            height: 60,
            sectionId: section.id,
          },
        },
        {
          op: "updateView",
          viewId: view.id,
          data: {
            settings: {
              sectionFrames: {
                [`boundary:${section.id}`]: { x: 950, y: 950, width: 950, height: 1000 },
              },
            },
          },
        },
      ],
    });
    const original = services.views.get(view.id).settings.annotations;
    const result = services.views.autoLayout(workspace.id, view.id, "LR").result;
    const frame = result.settings.sectionFrames[`boundary:${section.id}`];
    if (!frame) throw new Error("Auto-layout dropped the annotated Section frame");
    const card = result.elements.find((entry) => entry.elementId === action.id);
    if (!card) throw new Error("Missing test card");
    expect(frame.x).toBeLessThanOrEqual(card.x);
    expect(frame.y).toBeLessThanOrEqual(card.y);
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(1740);
    const note = original[0];
    if (!note) throw new Error("Missing test note");
    expect(frame.y + frame.height).toBeGreaterThanOrEqual(
      note.y + estimateAnnotationSize(note).height,
    );
    expect(result.settings.annotations).toEqual(original);
    const second = services.views.autoLayout(workspace.id, view.id, "LR").result;
    expect(second.settings.sectionFrames).toEqual(result.settings.sectionFrames);
  } finally {
    close();
  }
});
