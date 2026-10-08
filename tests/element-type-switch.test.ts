import { expect, test } from "bun:test";
import { elementKinds } from "@structsmith/contracts";
import {
  elementTypeOptions,
  elementTypeProblem,
} from "../apps/web/src/features/canvas/elementType";
import { createTestContext } from "./helpers";

test("type picker includes workflow, C4 and deployment kinds plus existing role presets", () => {
  expect(new Set(elementTypeOptions.map((option) => option.kind))).toEqual(new Set(elementKinds));
  expect(elementTypeOptions.find((option) => option.id === "database")).toMatchObject({
    kind: "container",
    role: "database",
  });
  expect(new Set(elementTypeOptions.map((option) => option.id)).size).toBe(
    elementTypeOptions.length,
  );
});

test("picker refuses leaf conversions with children and incompatible C4 parents", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = services.workspaces.create({ name: "Kinds", mode: "strict" });
    const group = services.elements.create(workspace.id, {
      name: "Capture",
      kind: "workflowGroup",
    }).result;
    const step = services.elements.create(workspace.id, {
      name: "Replay",
      kind: "action",
      parentId: group.id,
    }).result;
    const elements = services.elements.list(workspace.id);
    expect(elementTypeProblem(group, "decision", elements)).toContain("cannot contain");
    expect(elementTypeProblem(group, "outcome", elements)).toContain("cannot contain");
    expect(elementTypeProblem(step, "container", elements)).toContain("cannot live inside");
    expect(elementTypeProblem(group, "action", elements)).toBeNull();
    expect(elementTypeProblem(step, "decision", elements)).toBeNull();
    const before = services.model.getDocument(workspace.id);
    expect(() =>
      services.model.applyOperations(workspace.id, {
        operations: [
          { op: "updateElement", elementId: group.id, data: { kind: "outcome", role: null } },
        ],
      }),
    ).toThrow();
    expect(services.model.getDocument(workspace.id)).toEqual(before);
  } finally {
    close();
  }
});

test("conversion preserves model identity, all views, connector routing and comment threads through undo", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = services.workspaces.create({ name: "Types", mode: "strict" });
    const element = services.elements.create(workspace.id, {
      name: "Verify evidence",
      kind: "action",
      role: "worker",
      description: "Check capture",
      technology: "Bun",
      external: true,
      tags: ["current"],
      properties: { source: "portal" },
    }).result;
    const target = services.elements.create(workspace.id, {
      name: "Usable",
      kind: "outcome",
    }).result;
    services.relationships.create(workspace.id, {
      sourceElementId: element.id,
      targetElementId: target.id,
      description: "Safe",
    });
    const view = services.views.create(workspace.id, {
      name: "Verify",
      kind: "workflow",
      elementIds: [element.id, target.id],
    }).result;
    services.model.applyOperations(workspace.id, {
      operations: [
        {
          op: "addViewComment",
          viewId: view.id,
          data: { elementId: element.id, x: 21, y: 32, text: "Check safety" },
        },
        {
          op: "setLayout",
          viewId: view.id,
          entries: [{ elementId: element.id, x: 123, y: -34 }],
        },
      ],
    });
    const before = services.model.getDocument(workspace.id);
    const changed = services.model.applyOperations(workspace.id, {
      operations: [
        { op: "updateElement", elementId: element.id, data: { kind: "decision", role: null } },
      ],
    });
    const after = services.model.getDocument(workspace.id);
    const originalElement = before.elements.find((item) => item.id === element.id);
    const convertedElement = after.elements.find((item) => item.id === element.id);
    if (!originalElement || !convertedElement || !changed.snapshotId)
      throw new Error("Missing conversion data");
    const { updatedAt: _beforeUpdated, ...original } = originalElement;
    const { updatedAt: _afterUpdated, ...converted } = convertedElement;
    expect(converted).toEqual({ ...original, kind: "decision", role: null });
    expect(after.relationships).toEqual(before.relationships);
    expect(after.views).toEqual(before.views);
    expect(changed.snapshotId).toBeTruthy();
    services.snapshots.restore(changed.snapshotId);
    expect(services.elements.list(workspace.id).find((item) => item.id === element.id)).toEqual(
      element,
    );
    expect(services.model.getDocument(workspace.id).views).toEqual(before.views);
  } finally {
    close();
  }
});
