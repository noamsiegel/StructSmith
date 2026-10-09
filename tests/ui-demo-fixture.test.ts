import { describe, expect, test } from "bun:test";
import {
  elementKinds,
  elementRoles,
  interactionStyles,
  relationshipRoutings,
  WorkspaceDocumentSchema,
} from "@structsmith/contracts";
import {
  detailViewsFor,
  edgeLabel,
  estimateElementSize,
  estimateLabelSize,
  resolveRelationshipsForView,
  validateDocument,
} from "@structsmith/domain";
import {
  manualRelationshipPath,
  orthogonalRelationshipBends,
  slidingRelationshipLabel,
} from "../apps/web/src/features/canvas/relationshipGeometry";
import { buildUiDemoDocument, UI_DEMO_WORKSPACE_ID } from "../scripts/ui-demo-fixture";
import { createTestContext } from "./helpers";

const document = buildUiDemoDocument();
const byId = new Map(document.elements.map((element) => [element.id, element]));
const byKey = new Map(document.views.map((view) => [view.key, view]));

describe("UI demo fixture", () => {
  test("includes eight fan-out connectors and a pinned manual lane", () => {
    const view = byKey.get("demo-connector-lanes");
    if (!view) throw new Error("Missing connector lane fixture");
    const edges = document.relationships.filter((edge) => edge.sourceElementId === "demo-lane-hub");
    expect(edges.length).toBe(8);
    expect(view.elements.length).toBe(9);
    const pinned = view.relationships.find((edge) => edge.relationshipId === "demo-lane-edge-7");
    expect(pinned?.presentation?.sourceFraction).toBe(0.25);
    expect(pinned?.controlPoints).toEqual([
      { x: 500, y: 400 },
      { x: 500, y: 1098 },
    ]);
  });
  test("covers the right-border return route with invalid saved bends and expanded obstacles", () => {
    const view = byKey.get("demo-connectors");
    if (!view) throw new Error("Missing connector view");
    const edge = view.relationships.find(
      (entry) => entry.relationshipId === "demo-edge-dependency",
    );
    const source = view.elements.find((entry) => entry.elementId === "demo-edge-source-4");
    const target = view.elements.find((entry) => entry.elementId === "demo-edge-target-4");
    const obstacle = view.elements.find((entry) => entry.elementId === "demo-return-obstacle");
    if (!edge || !source || !target || !obstacle) throw new Error("Missing return-route fixture");
    expect(edge.presentation).toMatchObject({ sourceSide: "right", targetSide: "right" });
    expect(edge.controlPoints.length).toBeGreaterThan(0);
    expect(edge.controlPoints.every((point) => point.x < Math.min(source.x, target.x))).toBe(true);
    const size = estimateElementSize(byId.get(obstacle.elementId), view.settings, obstacle);
    expect(size.height).toBeGreaterThan(200);
    expect(obstacle.x > source.x + 220 && obstacle.x + size.width < target.x).toBe(true);
  });

  test("places orthogonal and straight connector labels clear of every card", () => {
    for (const key of ["demo-connectors", "demo-connectors-straight", "demo-native-flow"]) {
      const view = byKey.get(key);
      if (!view) throw new Error(`Missing connector view ${key}`);
      const bounds = new Map(
        view.elements.map((entry) => [
          entry.elementId,
          {
            ...entry,
            ...estimateElementSize(byId.get(entry.elementId), view.settings, entry),
          },
        ]),
      );
      for (const placement of view.relationships) {
        const edge = document.relationships.find(
          (relationship) => relationship.id === placement.relationshipId,
        );
        if (!edge) throw new Error(`Missing relationship ${placement.relationshipId}`);
        const sourceBounds = bounds.get(edge.sourceElementId);
        const targetBounds = bounds.get(edge.targetElementId);
        if (!sourceBounds || !targetBounds) throw new Error("Missing connector endpoint");
        const sourceSide = placement.presentation?.sourceSide ?? "right";
        const targetSide = placement.presentation?.targetSide ?? "left";
        const handle = (rect: typeof sourceBounds, side: typeof sourceSide, slot: number) => {
          const offset = (slot + 1) / 4;
          return side === "top" || side === "bottom"
            ? { x: rect.x + rect.width * offset, y: rect.y + (side === "bottom" ? rect.height : 0) }
            : { x: rect.x + (side === "right" ? rect.width : 0), y: rect.y + rect.height * offset };
        };
        const source = handle(sourceBounds, sourceSide, placement.presentation?.sourceSlot ?? 1);
        const target = handle(targetBounds, targetSide, placement.presentation?.targetSlot ?? 1);
        const bends =
          view.settings.relationshipRouting === "orthogonal"
            ? orthogonalRelationshipBends(
                source,
                target,
                sourceSide as Parameters<typeof orthogonalRelationshipBends>[2],
                targetSide as Parameters<typeof orthogonalRelationshipBends>[3],
                placement.controlPoints,
              )
            : placement.controlPoints;
        if (view.settings.relationshipRouting === "orthogonal") {
          const points = [source, ...bends, target];
          for (let i = 1; i < points.length; i++) {
            expect(points[i - 1]?.x === points[i]?.x || points[i - 1]?.y === points[i]?.y).toBe(
              true,
            );
          }
        }
        const [, x, y] = manualRelationshipPath(
          source,
          target,
          bends,
          placement.labelPosition ?? 0.5,
        );
        const point = slidingRelationshipLabel(
          [source, ...bends, target],
          { x, y },
          placement.presentation?.labelOffset?.x ?? 0,
          false,
          placement.presentation?.labelOffset?.y ?? 0,
        );
        const label = estimateLabelSize(
          edgeLabel({ ...edge, implied: false, relationships: [edge] }),
        );
        if (!label) continue;
        const halfWidth = Math.min(170, label.width) / 2 + 8;
        const halfHeight = label.height / 2 + 8;
        const obscuredBy = [...bounds.values()].filter(
          (rect) =>
            point.x - halfWidth < rect.x + rect.width &&
            point.x + halfWidth > rect.x &&
            point.y - halfHeight < rect.y + rect.height &&
            point.y + halfHeight > rect.y,
        );
        expect(obscuredBy.map((rect) => `${key}:${edge.id}:${rect.elementId}`)).toEqual([]);
      }
    }
  });

  test("reserves non-overlapping card bounds in every saved view", () => {
    for (const view of document.views) {
      const bounds = view.elements
        .filter((entry) => !entry.hidden)
        .map((entry) => ({
          ...entry,
          ...estimateElementSize(byId.get(entry.elementId), view.settings, entry),
        }));
      const overlaps: string[] = [];
      for (let index = 0; index < bounds.length; index++) {
        const left = bounds[index];
        if (!left) continue;
        for (const right of bounds.slice(index + 1)) {
          if (
            left.x < right.x + right.width &&
            left.x + left.width > right.x &&
            left.y < right.y + right.height &&
            left.y + left.height > right.y
          ) {
            overlaps.push(`${view.key}: ${left.elementId} / ${right.elementId}`);
          }
        }
      }
      expect(overlaps).toEqual([]);
    }
  });

  test("is deterministic, contract-valid and contains every supported kind, role and connector routing", () => {
    expect(buildUiDemoDocument()).toEqual(document);
    expect(WorkspaceDocumentSchema.safeParse(document).success).toBe(true);
    expect(validateDocument(document).valid).toBe(true);
    expect(document.workspace.id).toBe(UI_DEMO_WORKSPACE_ID);
    expect(new Set(document.elements.map((element) => element.kind))).toEqual(
      new Set(elementKinds),
    );
    expect(new Set(document.elements.map((element) => element.role).filter(Boolean))).toEqual(
      new Set(elementRoles),
    );
    expect(new Set(document.relationships.map((edge) => edge.interactionStyle))).toEqual(
      new Set(interactionStyles),
    );
    expect(new Set(document.views.map((view) => view.settings.relationshipRouting))).toEqual(
      new Set(relationshipRoutings),
    );
  });

  test("offers seven Home destinations, preferred details, a chooser and a four-view drill path", () => {
    const home = byKey.get("demo-home");
    expect(document.views[0]?.key).toBe("demo-home");
    expect(home?.elements).toHaveLength(7);
    for (const { elementId } of home?.elements ?? []) {
      const element = byId.get(elementId);
      if (!element) throw new Error(`Missing Home destination ${elementId}`);
      const choices = detailViewsFor(element, document.views, home?.id);
      const preferred = home?.settings.preferredDetailViews[elementId];
      if (!preferred) throw new Error(`Missing preferred Home view for ${elementId}`);
      expect(choices.map((choice) => choice.id)).toContain(preferred);
    }
    const process = byId.get("demo-section-process");
    if (!process) throw new Error("Missing process fixture");
    expect(detailViewsFor(process, document.views)).toHaveLength(2);
    const path = [
      ["demo-home", "demo-nav-sections", "demo-sections"],
      ["demo-sections", "demo-section-process", "demo-process"],
      ["demo-process", "demo-process-validate", "demo-validate"],
    ] as const;
    for (const [from, elementId, to] of path) {
      expect(byKey.get(from)?.settings.preferredDetailViews[elementId]).toBe(to);
      expect(byKey.get(to)?.scopeElementId).toBe(elementId);
    }
    expect(
      byKey
        .get("demo-validate")
        ?.elements.every((entry) => byId.get(entry.elementId)?.kind !== "workflowGroup"),
    ).toBe(true);
  });

  test("offers view-owned text, notes and tables with Section membership and empty/long content", () => {
    const view = byKey.get("demo-annotations");
    if (!view) throw new Error("Missing annotation demo");
    expect(view.elements).toHaveLength(0);
    expect(new Set(view.settings.annotations.map((item) => item.kind))).toEqual(
      new Set(["text", "note", "table"]),
    );
    const section = view.boundaries.find((item) => item.id === "demo-annotations-section");
    expect(section?.kind).toBe("custom");
    expect(view.settings.annotations.filter((item) => item.sectionId === section?.id)).toHaveLength(
      2,
    );
    const table = view.settings.annotations.find((item) => item.kind === "table");
    if (table?.kind !== "table") throw new Error("Missing table");
    expect(table.cells).toHaveLength(3);
    expect(table.cells[1]).toEqual(["Ledger complete", "Account A", "Publish"]);
    expect(view.settings.annotations.some((item) => item.kind === "text" && item.text === "")).toBe(
      true,
    );
    expect(document.elements.some((item) => item.id.startsWith("demo-annotation-"))).toBe(false);
  });

  test("covers long and multilingual text, multiline descriptions on every shape, and a saved tall placement", () => {
    expect(byId.get("demo-text-long")?.name.length).toBeGreaterThan(90);
    expect(byId.get("demo-text-unbroken")?.name).toMatch(/^\S{80,}$/);
    expect(byId.get("demo-text-multiline")?.name.split("\n")).toHaveLength(3);
    expect(byId.get("demo-text-cjk")?.name).toMatch(/[\u3040-\u9fff]/);
    expect(byId.get("demo-text-emoji")?.name).toContain("🧭");
    const stress = byKey.get("demo-typography-stress");
    for (const kind of ["action", "decision", "outcome", "custom", "container"]) {
      const element = byId.get(`demo-text-stress-${kind}`);
      expect(element?.description?.split("\n")).toHaveLength(12);
      expect(stress?.elements.some((entry) => entry.elementId === element?.id)).toBe(true);
    }
    expect(byId.get("demo-text-stress-container")?.role).toBe("database");
    expect(stress?.elements.find((entry) => entry.elementId === "demo-text-tall")?.height).toBe(
      1000,
    );
  });

  test("covers empty and nested Sections and parallel direct and lifted subprocess edges", () => {
    const sectionView = byKey.get("demo-sections");
    expect(
      sectionView?.boundaries.find((section) => section.id === "demo-section-inner")
        ?.parentBoundaryId,
    ).toBe("demo-section-outer");
    expect(
      sectionView?.boundaries.find((section) => section.id === "demo-section-inner")?.name.length,
    ).toBeGreaterThan(70);
    expect(
      sectionView?.boundaries.find((section) => section.id === "demo-section-empty")?.elementIds,
    ).toEqual([]);
    expect(sectionView?.settings.sectionFrames["boundary:demo-section-empty"]?.width).toBe(160);
    const process = byKey.get("demo-process");
    const resolved = resolveRelationshipsForView(
      document.elements,
      document.relationships,
      new Set(process?.elements.map((entry) => entry.elementId)),
    );
    const parallel = resolved.filter(
      (edge) =>
        edge.sourceElementId === "demo-process-validate" &&
        edge.targetElementId === "demo-process-deliver",
    );
    expect(parallel).toHaveLength(2);
    expect(new Set(parallel.map((edge) => edge.implied))).toEqual(new Set([true, false]));
  });

  test("covers connector presentation and attached/free/resolved comment threads", () => {
    const connectors = byKey.get("demo-connectors")?.relationships ?? [];
    const presentations = connectors.map((edge) => edge.presentation);
    expect(new Set(presentations.map((entry) => entry?.strokeStyle))).toEqual(
      new Set(["solid", "dashed", "dotted"]),
    );
    for (const end of ["source", "target"] as const) {
      expect(new Set(presentations.map((entry) => entry?.[`${end}Side`]))).toEqual(
        new Set(["left", "right", "top", "bottom"]),
      );
      expect(new Set(presentations.map((entry) => entry?.[`${end}Slot`]))).toEqual(
        new Set([0, 1, 2]),
      );
      expect(new Set(presentations.map((entry) => entry?.[`${end}Arrow`]))).toEqual(
        new Set(["none", "arrow", "arrowclosed"]),
      );
    }
    expect(
      connectors.some(
        (edge) => edge.controlPoints.length === 4 && edge.presentation?.labelOffset?.y === 40,
      ),
    ).toBe(true);
    expect(
      connectors.find((edge) => edge.relationshipId === "demo-edge-sync")?.presentation
        ?.sourceFraction,
    ).toBe(0.37);
    expect(
      connectors.find((edge) => edge.relationshipId === "demo-edge-data")?.presentation
        ?.targetFraction,
    ).toBe(0.73);
    expect(
      connectors.find((edge) => edge.relationshipId === "demo-edge-custom")?.presentation,
    ).toMatchObject({ sourcePoint: { x: 1680, y: 1660 }, targetPoint: { x: 1680, y: 2200 } });
    const clearance = byKey.get("demo-label-clearance");
    expect({
      cardGap:
        (clearance?.elements.find((entry) => entry.elementId === "demo-edge-target-0")?.x ?? 0) -
        (clearance?.elements.find((entry) => entry.elementId === "demo-edge-source-0")?.x ?? 0) -
        220,
      labelsAtEndpoint: clearance?.relationships.filter((edge) => edge.labelPosition === 1).length,
      annotationX: clearance?.settings.annotations[0]?.x,
      titleLines: clearance?.boundaries[0]?.name.split("\n").length,
    }).toEqual({ cardGap: 16, labelsAtEndpoint: 6, annotationX: 470, titleLines: 2 });
    const comments = byKey.get("demo-comments")?.settings.commentPins ?? [];
    expect(
      connectors.find((edge) => edge.relationshipId === "demo-edge-dependency")?.presentation,
    ).toMatchObject({ sourceSide: "right", targetSide: "right" });
    expect(comments.some((pin) => pin.elementId && !pin.resolved && pin.replies.length === 2)).toBe(
      true,
    );
    expect(
      comments.some((pin) => !pin.elementId && !pin.resolved && pin.replies.length === 0),
    ).toBe(true);
    expect(comments.some((pin) => !pin.elementId && pin.resolved && pin.replies.length === 1)).toBe(
      true,
    );
  });

  test("retains automatic alignment and the eight-pixel grid phase regression", () => {
    const alignment = byKey.get("demo-connection-alignment");
    const source = alignment?.elements.find(
      (entry) => entry.elementId === "demo-alignment-source-1",
    );
    const target = alignment?.elements.find(
      (entry) => entry.elementId === "demo-alignment-target-1",
    );
    expect({
      grid: alignment?.settings.snapToGrid,
      equalRows: source?.y === target?.y,
      centerDifference: ((source?.height ?? 0) - (target?.height ?? 0)) / 2,
      pinnedEnds: alignment?.relationships.find(
        (entry) => entry.relationshipId === "demo-alignment-edge-1",
      )?.presentation,
      vertical: alignment?.relationships.find(
        (entry) => entry.relationshipId === "demo-alignment-edge-2",
      )?.presentation,
    }).toEqual({
      grid: true,
      equalRows: true,
      centerDifference: 8,
      pinnedEnds: {
        sourceSide: "right",
        targetSide: "left",
        sourceFraction: 0.5,
        targetFraction: 0.5,
      },
      vertical: { sourceSide: "bottom", targetSide: "top" },
    });
  });

  test("retains the short Section title, legacy bends and right-side endpoint drag fixture", () => {
    const view = byKey.get("demo-connection-alignment");
    if (!view) throw new Error("Missing connector alignment view");
    const section = view.boundaries.find((entry) => entry.id === "demo-route-section");
    const legacy = view.relationships.find(
      (entry) => entry.relationshipId === "demo-route-title-edge",
    );
    const sidechange = view.relationships.find(
      (entry) => entry.relationshipId === "demo-route-sidechange-edge",
    );
    expect({
      settings: [view.settings.snapToGrid, view.settings.relationshipRouting],
      section: [section?.name, section?.kind, section?.elementIds],
      frame: view.settings.sectionFrames["boundary:demo-route-section"],
      legacy: [legacy?.presentation, legacy?.controlPoints],
      sidechange: [sidechange?.presentation, sidechange?.controlPoints],
    }).toEqual({
      settings: [true, "orthogonal"],
      section: ["Set up", "custom", ["demo-route-source"]],
      frame: { x: 1416, y: 384, width: 656, height: 300 },
      legacy: [
        {
          sourceSide: "top",
          sourceFraction: 0.5,
          targetSide: "top",
          targetPoint: { x: 1920, y: 129 },
        },
        [
          { x: 1920, y: 376 },
          { x: 1936, y: 376 },
          { x: 1936, y: 324 },
          { x: 1984, y: 324 },
          { x: 1984, y: 129 },
        ],
      ],
      sidechange: [
        {
          sourceSide: "right",
          sourceFraction: 0.5,
          targetSide: "right",
          targetFraction: 0.5,
        },
        [
          { x: 2576, y: 492 },
          { x: 2576, y: 132 },
        ],
      ],
    });
    expect(byId.get("demo-route-source")?.kind).toBe("action");
    expect(byId.get("demo-route-target")?.kind).toBe("outcome");
  });

  test("covers colors, statuses, locked/hidden placements and scenario element/relationship steps", () => {
    const states = byKey.get("demo-states");
    expect(byId.get("demo-state-live")?.tags).toContain("status:live");
    expect(byId.get("demo-state-planned")?.tags).toContain("status:planned");
    expect(byId.get("demo-state-neutral")?.tags).toEqual([]);
    expect(byId.get("demo-state-mixed")?.tags).toEqual(["status:live", "status:planned"]);
    expect(
      document.relationships.find((edge) => edge.id === "demo-state-mixed-edge")?.tags,
    ).toEqual(["status:live", "status:planned"]);
    expect(states?.settings.nodeColors["boundary:demo-state-section"]).toBe("#2563eb");
    expect(states?.settings.nodeColors["demo-state-planned"]).toBe("#7c3aed");
    expect(states?.elements.find((entry) => entry.elementId === "demo-state-locked")?.locked).toBe(
      true,
    );
    expect(states?.elements.find((entry) => entry.elementId === "demo-state-hidden")?.hidden).toBe(
      true,
    );
    expect(
      states?.settings.scenarios[0]?.steps.map((step) => [step.elementId, step.relationshipId]),
    ).toEqual([
      ["demo-state-live", undefined],
      ["demo-state-planned", "demo-state-edge"],
    ]);
  });

  test("imports without remapping IDs and exercises real layout while preserving locked and hidden placements", () => {
    const { services, close } = createTestContext();
    try {
      services.workspaces.create({ id: UI_DEMO_WORKSPACE_ID, name: "Disposable demo" });
      services.imports.importDocument(document, { mode: "overwrite" });
      const imported = services.model.getDocument(UI_DEMO_WORKSPACE_ID);
      expect(imported.elements).toEqual(document.elements);
      expect([...imported.views].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        [...document.views].sort((a, b) => a.id.localeCompare(b.id)),
      );
      const locked = services.views.get("demo-states").elements.find((entry) => entry.locked);
      for (const key of [
        "demo-catalog",
        "demo-typography",
        "demo-sections",
        "demo-connectors",
        "demo-states",
      ]) {
        for (const algorithm of ["dagre", "grid"] as const) {
          const layout = services.views.autoLayout(
            UI_DEMO_WORKSPACE_ID,
            key,
            "LR",
            algorithm,
          ).result;
          expect(
            layout.elements.every((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y)),
          ).toBe(true);
        }
      }
      const states = services.views.get("demo-states");
      expect(states.elements.find((entry) => entry.locked)).toEqual(locked);
      expect(states.elements.find((entry) => entry.elementId === "demo-state-hidden")?.hidden).toBe(
        true,
      );
      expect(services.model.validate(UI_DEMO_WORKSPACE_ID).valid).toBe(true);
    } finally {
      close();
    }
  });
});
