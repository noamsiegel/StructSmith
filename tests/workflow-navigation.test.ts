import { expect, test } from "bun:test";
import { WorkspaceDocumentSchema } from "@structsmith/contracts";
import {
  canOpenElementDetails,
  detailViewElementIds,
  detailViewsFor,
  toMermaid,
} from "@structsmith/domain";
import { createTestContext } from "./helpers";

test("custom workflow groups navigate to existing interiors without duplicate elements or views", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = services.workspaces.create({ name: "Existing workflow" });
    const group = services.elements.create(workspace.id, { kind: "custom", name: "Scrape" }).result;
    const child = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Replay",
      parentId: group.id,
    }).result;
    const context = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Verify",
    }).result;
    services.relationships.create(workspace.id, {
      sourceElementId: child.id,
      targetElementId: context.id,
      description: "Captured evidence",
    });
    const overview = services.views.create(workspace.id, {
      name: "Overview",
      kind: "custom",
      elementIds: [group.id, context.id],
    }).result;
    const interior = services.views.create(workspace.id, {
      name: "Replay details",
      kind: "custom",
      scopeElementId: group.id,
      elementIds: [child.id, context.id],
    }).result;
    const before = services.model.get(workspace.id);
    const elements = services.elements.list(workspace.id);
    const views = services.views.list(workspace.id);
    expect(detailViewsFor(group, views, overview.id).map((view) => view.id)).toEqual([interior.id]);
    expect(canOpenElementDetails(group, elements, views, overview.id)).toBe(true);
    expect(canOpenElementDetails(group, elements, views, interior.id)).toBe(false);
    expect(canOpenElementDetails(context, elements, views, overview.id)).toBe(false);
    expect(
      new Set(detailViewElementIds(group, elements, services.relationships.list(workspace.id))),
    ).toEqual(new Set([child.id, context.id]));
    expect(services.model.get(workspace.id)).toEqual(before);
  } finally {
    close();
  }
});

test("native workflow semantics coexist with strict C4 and survive documents, import and snapshots", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = services.workspaces.create({ name: "Workflow", mode: "strict" });
    const group = services.elements.create(workspace.id, {
      kind: "workflowGroup",
      name: "Capture",
    }).result;
    const system = services.elements.create(workspace.id, {
      kind: "softwareSystem",
      name: "Mesh",
    }).result;
    const action = services.elements.create(workspace.id, {
      kind: "action",
      name: "Replay",
      parentId: group.id,
    }).result;
    const decision = services.elements.create(workspace.id, {
      kind: "decision",
      name: "Safe?",
      parentId: group.id,
    }).result;
    const outcome = services.elements.create(workspace.id, {
      kind: "outcome",
      name: "Held",
      parentId: group.id,
    }).result;
    for (const [source, target, description] of [
      [action, system, "Executes through"],
      [action, decision, "Evidence"],
      [decision, outcome, "No"],
    ] as const)
      services.relationships.create(workspace.id, {
        sourceElementId: source.id,
        targetElementId: target.id,
        description,
      });
    const view = services.views.create(workspace.id, {
      name: "Capture details",
      kind: "workflow",
      scopeElementId: group.id,
      elementIds: [action.id, system.id, decision.id, outcome.id],
    }).result;
    const document = WorkspaceDocumentSchema.parse(services.model.getDocument(workspace.id));
    expect(services.model.validate(workspace.id).valid).toBe(true);
    expect(toMermaid(document, { view: services.views.get(view.id) })).toContain('{"Safe?');
    const imported = services.imports.importDocument(document);
    expect(
      services.model
        .get(imported.id)
        .elements.map((element) => element.kind)
        .sort(),
    ).toEqual(document.elements.map((element) => element.kind).sort());
    expect(services.views.list(imported.id)[0]?.kind).toBe("workflow");
    const changed = services.model.applyOperations(workspace.id, {
      operations: [{ op: "updateElement", elementId: decision.id, data: { kind: "action" } }],
    });
    expect(changed.snapshotId).toBeTruthy();
    services.snapshots.restore(changed.snapshotId as string);
    expect(
      services.elements.list(workspace.id).find((element) => element.id === decision.id)?.kind,
    ).toBe("decision");
    expect(
      services.elements.list(workspace.id).find((element) => element.id === system.id)?.kind,
    ).toBe("softwareSystem");
    expect(detailViewsFor(group, services.views.list(workspace.id)).map((item) => item.id)).toEqual(
      [view.id],
    );
    expect(() =>
      services.elements.create(workspace.id, {
        kind: "action",
        name: "Bad child",
        parentId: decision.id,
      }),
    ).toThrow();
    for (const kind of ["decision", "outcome"] as const) {
      expect(() => services.elements.update(workspace.id, group.id, { kind })).toThrow();
      expect(services.elements.list(workspace.id).find((item) => item.id === group.id)?.kind).toBe(
        "workflowGroup",
      );
    }
    expect(() =>
      services.elements.update(workspace.id, action.id, { kind: "container" }),
    ).toThrow();
    expect(services.model.validate(workspace.id).valid).toBe(true);
  } finally {
    close();
  }
});
