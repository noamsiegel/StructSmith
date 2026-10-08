import { expect, test } from "bun:test";
import { UpdateViewSchema } from "@structsmith/contracts";
import { buildGraph, computeCanvasBoundaries } from "../apps/web/src/features/canvas/graph";
import {
  relationshipFocus,
  relationshipLabelBackground,
} from "../apps/web/src/features/canvas/RelationshipEdge";
import { relationshipStatus, statusFromTags } from "../apps/web/src/features/canvas/statusOverlay";
import { createTestContext, createWorkspace } from "./helpers";

test("selecting an element emphasizes only its directly connected relationships", () => {
  expect(relationshipFocus(null, "a", "b")).toBe("normal");
  expect(relationshipFocus("a", "a", "b")).toBe("connected");
  expect(relationshipFocus("b", "a", "b")).toBe("connected");
  expect(relationshipFocus("c", "a", "b")).toBe("dimmed");
});

test("relationship labels use an opaque card background", () => {
  expect(relationshipLabelBackground("normal")).toBe("var(--card)");
  expect(relationshipLabelBackground("dimmed")).toBe("var(--card)");
  expect(relationshipLabelBackground("connected")).toBe(
    "color-mix(in oklch, var(--primary) 12%, var(--card))",
  );
});

test("legacy title settings stay scoped and undoable while readable cards retain placement", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const element = services.elements.create(workspace.id, {
      kind: "container",
      name: "Shared platform backend for accounts, documents and notifications",
      description: "Manages accounts and permissions.\nDelivers documents and notifications.",
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Detailed view",
      kind: "container",
      elementIds: [element.id],
    }).result;
    const other = services.views.create(workspace.id, {
      name: "Compact view",
      kind: "container",
      elementIds: [element.id],
    }).result;
    const originalPlacement = services.views.get(view.id).elements;
    const update = (settings: { showFullTitles?: boolean; showDescriptions?: boolean }) =>
      services.model.applyOperations(
        workspace.id,
        {
          operations: [
            { op: "updateView", viewId: view.id, data: UpdateViewSchema.parse({ settings }) },
          ],
        },
        "ui",
      );
    const graph = () =>
      buildGraph({
        view: services.views.get(view.id),
        elements: [element],
        relationships: [],
        records: [],
      });

    update({ showFullTitles: true });
    expect(graph().nodes[0]?.data).toMatchObject({ showFullTitles: true, showDescriptions: false });
    update({ showDescriptions: true });
    expect(graph().nodes[0]?.data).toMatchObject({ showFullTitles: true, showDescriptions: true });
    const changed = update({ showFullTitles: false });
    expect(graph().nodes[0]?.data).toMatchObject({ showFullTitles: false, showDescriptions: true });
    expect(services.views.get(other.id).settings).toMatchObject({
      showFullTitles: false,
      showDescriptions: false,
    });
    expect(services.views.get(view.id).elements).toEqual(originalPlacement);

    if (!changed.snapshotId) throw new Error("Expected an undo snapshot");
    services.snapshots.restore(changed.snapshotId);
    expect(services.views.get(view.id).settings).toMatchObject({
      showFullTitles: true,
      showDescriptions: true,
    });
    update({ showFullTitles: false, showDescriptions: false });
    expect(graph().nodes[0]).toMatchObject({ width: 220 });
    expect(graph().nodes[0]?.data.minimumHeight).toBeGreaterThan(96);
    expect(graph().nodes[0]?.height).toBeUndefined();
    expect(services.views.get(view.id).elements).toEqual(originalPlacement);
  } finally {
    close();
  }
});

test("auto layout reserves space for expanded cards and retains saved custom sizes", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const elements = ["First", "Second"].map(
      (name) =>
        services.elements.create(workspace.id, {
          kind: "container",
          name: `${name} platform component with a long title that must wrap across multiple lines`,
          description: "A separate line of details.\n".repeat(15),
        }).result,
    );
    const source = elements[0];
    const target = elements[1];
    if (!source || !target) throw new Error("Missing elements");
    services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    });
    const view = services.views.create(workspace.id, {
      name: "Expanded view",
      kind: "container",
      elementIds: elements.map((element) => element.id),
      settings: { showFullTitles: true, showDescriptions: true },
    }).result;
    services.views.saveLayout(workspace.id, view.id, [
      { elementId: source.id, width: 260, height: 110 },
    ]);
    services.views.autoLayout(workspace.id, view.id, "TB");
    const detail = services.views.get(view.id);
    const graph = buildGraph({ view: detail, elements, relationships: [], records: [] });
    const first = graph.nodes.find((node) => node.id === source.id);
    const second = graph.nodes.find((node) => node.id === target.id);
    if (!first || !second || first.type !== "element") throw new Error("Missing nodes");
    expect(first.data.minimumHeight).toBeGreaterThan(300);
    expect(second.position.y).toBeGreaterThan(first.position.y + first.data.minimumHeight);
    expect(detail.elements.find((entry) => entry.elementId === source.id)).toMatchObject({
      width: 260,
      height: 110,
    });
    services.views.update(workspace.id, view.id, {
      settings: { showFullTitles: false, showDescriptions: false },
    });
    const compact = buildGraph({
      view: services.views.get(view.id),
      elements,
      relationships: [],
      records: [],
    }).nodes.find((node) => node.id === source.id);
    expect(compact).toMatchObject({ width: 260 });
    expect(compact?.data.minimumHeight).toBeGreaterThan(110);
    expect(compact?.data.minimumHeight).toBeLessThan(first.data.minimumHeight);
  } finally {
    close();
  }
});

test("status tags remain explicit, relationship status overrides endpoints, and Off restores presentation", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const live = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Live",
      tags: ["status:live"],
    }).result;
    const planned = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Planned",
      tags: ["status:planned"],
    }).result;
    const untagged = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Unknown",
      tags: ["live"],
    }).result;
    const conflict = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Mixed",
      tags: ["status:live", "status:planned"],
    }).result;
    const elements = [live, planned, untagged, conflict];
    const byId = new Map(elements.map((element) => [element.id, element]));
    const inferred = services.relationships.create(workspace.id, {
      sourceElementId: live.id,
      targetElementId: planned.id,
    }).result;
    const explicit = services.relationships.create(workspace.id, {
      sourceElementId: planned.id,
      targetElementId: live.id,
      tags: ["status:live"],
    }).result;
    const unknown = services.relationships.create(workspace.id, {
      sourceElementId: live.id,
      targetElementId: untagged.id,
    }).result;
    const mixed = services.relationships.create(workspace.id, {
      sourceElementId: live.id,
      targetElementId: conflict.id,
      tags: ["status:live", "status:planned"],
    }).result;
    const relationships = [inferred, explicit, unknown, mixed];
    const view = services.views.create(workspace.id, {
      kind: "custom",
      name: "Status",
      elementIds: elements.map((element) => element.id),
    }).result;
    const placement = { color: "#123456", strokeStyle: "dotted" as const, strokeWidth: 3 };
    services.views.saveLayout(workspace.id, view.id, [{ elementId: live.id, x: 240, y: 160 }]);
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "setViewRelationships",
            viewId: view.id,
            relationships: [{ relationshipId: inferred.id, presentation: placement }],
          },
        ],
      },
      "ui",
    );
    const detail = services.views.get(view.id);
    const original = structuredClone(detail);
    const graph = (statusOverlay: "off" | "status" | "liveOnly") =>
      buildGraph({ view: detail, elements, relationships, records: [], statusOverlay });
    const status = graph("status");
    expect(Object.fromEntries(status.nodes.map((node) => [node.id, node.data.status]))).toEqual({
      [live.id]: "live",
      [planned.id]: "planned",
      [untagged.id]: null,
      [conflict.id]: "conflict",
    });
    expect(status.edges.map((edge) => edge.data?.status)).toEqual([
      "planned",
      "live",
      null,
      "conflict",
    ]);
    expect(status.nodes.find((node) => node.id === live.id)?.position).toEqual({ x: 240, y: 160 });
    expect(relationshipStatus(explicit, byId)).toBe("live");
    expect(statusFromTags(["Live", "live", "status:LIVE"])).toBeNull();
    const off = graph("off");
    expect(off.nodes.every((node) => node.data.status === null)).toBe(true);
    expect(off.edges.every((edge) => edge.data?.status === null)).toBe(true);
    expect(off.edges[0]?.data?.placement?.presentation).toEqual(placement);
    expect(off.nodes.map((node) => node.position)).toEqual(
      status.nodes.map((node) => node.position),
    );
    const filtered = graph("liveOnly");
    expect(filtered.nodes.map((node) => node.id)).toEqual([live.id]);
    expect(filtered.edges).toEqual([]);
    expect(filtered.nodes[0]?.position).toEqual({ x: 240, y: 160 });
    expect(detail).toEqual(original);
    expect(services.views.get(view.id)).toEqual(original);
  } finally {
    close();
  }
});

test("Live only filters actual endpoints before lifting and preserves boundary footprints", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const parent = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Source group",
      tags: ["status:live"],
    }).result;
    const live = services.elements.create(workspace.id, {
      kind: "custom",
      parentId: parent.id,
      name: "Live child",
      tags: ["status:live"],
    }).result;
    const planned = services.elements.create(workspace.id, {
      kind: "custom",
      parentId: parent.id,
      name: "Planned child",
      tags: ["status:planned"],
    }).result;
    const untagged = services.elements.create(workspace.id, {
      kind: "custom",
      parentId: parent.id,
      name: "Unknown child",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Target",
      tags: ["status:live"],
    }).result;
    const elements = [parent, live, planned, untagged, target];
    const relationships = [live, planned, untagged].map(
      (source) =>
        services.relationships.create(workspace.id, {
          sourceElementId: source.id,
          targetElementId: target.id,
          tags: source.id === planned.id ? ["status:live"] : [],
        }).result,
    );
    const view = services.views.create(workspace.id, {
      kind: "custom",
      name: "Lifted",
      elementIds: [parent.id, target.id],
    }).result;
    services.views.saveLayout(workspace.id, view.id, [
      { elementId: parent.id, x: 25, y: 70 },
      { elementId: target.id, x: 400, y: 70 },
    ]);
    const detail = services.views.get(view.id);
    const build = (statusOverlay: "off" | "status" | "liveOnly") =>
      buildGraph({ view: detail, elements, relationships, records: [], statusOverlay });
    expect(build("status").edges[0]?.data).toMatchObject({
      implied: true,
      count: 3,
      status: "conflict",
    });
    const filtered = build("liveOnly");
    expect(filtered.edges).toHaveLength(1);
    expect(filtered.edges[0]).toMatchObject({
      source: parent.id,
      target: target.id,
      data: { implied: true, count: 1, relationship: relationships[0], status: "live" },
    });
    expect(filtered.nodes.map((node) => node.position)).toEqual([
      { x: 25, y: 70 },
      { x: 400, y: 70 },
    ]);
    expect(build("off").edges[0]?.data).toMatchObject({ count: 3, status: null });
    const byId = new Map(elements.map((element) => [element.id, element]));
    const boundary = {
      id: "wrapper",
      workspaceId: workspace.id,
      createdAt: parent.createdAt,
      updatedAt: parent.updatedAt,
      viewId: view.id,
      name: "Related steps",
      kind: "custom" as const,
      layer: "custom" as const,
      classification: null,
      parentBoundaryId: null,
      elementIds: [parent.id, target.id],
      tags: [],
      properties: {},
      description: null,
    };
    const sources = filtered.nodes.map((node) => ({
      id: node.id,
      ...node.position,
      width: node.width ?? 220,
      height: node.height ?? 96,
    }));
    const boxes = computeCanvasBoundaries(sources, byId, [boundary], "custom", true);
    expect(boxes.semanticBoundaries[0]).toMatchObject({
      position: { x: -3, y: 6 },
      width: 651,
      height: 188,
    });
    expect(
      computeCanvasBoundaries([], byId, [boundary], "custom", true).semanticBoundaries,
    ).toEqual([]);
    expect(
      detail.elements.map((entry) => ({ id: entry.elementId, x: entry.x, y: entry.y })),
    ).toEqual([
      { id: parent.id, x: 25, y: 70 },
      { id: target.id, x: 400, y: 70 },
    ]);
  } finally {
    close();
  }
});
