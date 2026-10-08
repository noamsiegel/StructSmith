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
  estimateElementSize,
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
  test("places orthogonal and straight connector labels clear of every card", () => {
    for (const key of ["demo-connectors", "demo-connectors-straight"]) {
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
          key === "demo-connectors"
            ? orthogonalRelationshipBends(
                source,
                target,
                sourceSide as Parameters<typeof orthogonalRelationshipBends>[2],
                targetSide as Parameters<typeof orthogonalRelationshipBends>[3],
                placement.controlPoints,
              )
            : placement.controlPoints;
        if (key === "demo-connectors") {
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
        const obscuredBy = [...bounds.values()].filter(
          (rect) =>
            point.x - 85 < rect.x + rect.width &&
            point.x + 85 > rect.x &&
            point.y - 32 < rect.y + rect.height &&
            point.y + 32 > rect.y,
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

  test("offers six Home destinations, preferred details, a chooser and a four-view drill path", () => {
    const home = byKey.get("demo-home");
    expect(document.views[0]?.key).toBe("demo-home");
    expect(home?.elements).toHaveLength(6);
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
    const comments = byKey.get("demo-comments")?.settings.commentPins ?? [];
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
