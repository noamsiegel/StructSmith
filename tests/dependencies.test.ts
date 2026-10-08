import { expect, test } from "bun:test";
import { elementDependencies, safeWebLink } from "@structsmith/domain";
import { createTestContext, createWorkspace } from "./helpers";

test("dependency inspector derives descendant boundaries and direct placements without duplicate internal edges", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const group = services.elements.create(workspace.id, {
      name: "Capture",
      kind: "workflowGroup",
    }).result;
    const child = services.elements.create(workspace.id, {
      name: "Worker",
      kind: "action",
      parentId: group.id,
    }).result;
    const peer = services.elements.create(workspace.id, { name: "Portal", kind: "custom" }).result;
    const incoming = services.relationships.create(workspace.id, {
      sourceElementId: peer.id,
      targetElementId: child.id,
    }).result;
    const outgoing = services.relationships.create(workspace.id, {
      sourceElementId: group.id,
      targetElementId: peer.id,
    }).result;
    services.relationships.create(workspace.id, {
      sourceElementId: group.id,
      targetElementId: child.id,
    });
    const direct = services.views.create(workspace.id, {
      name: "Overview",
      kind: "workflow",
      elementIds: [group.id, peer.id],
    }).result;
    const detail = services.views.create(workspace.id, {
      name: "Detail",
      kind: "workflow",
      scopeElementId: group.id,
      elementIds: [child.id],
    }).result;
    const model = services.model.get(workspace.id);
    const result = elementDependencies(group.id, model.elements, model.relationships, [
      direct,
      detail,
    ]);
    expect(result.incoming.map((item) => item.id)).toEqual([incoming.id]);
    expect(result.outgoing.map((item) => item.id)).toEqual([outgoing.id]);
    expect(result.usedIn.map((item) => item.id)).toEqual([direct.id, detail.id]);
    const leaf = elementDependencies(child.id, model.elements, model.relationships, [
      direct,
      detail,
    ]);
    expect(leaf.usedIn.map((item) => item.id)).toEqual([detail.id]);
  } finally {
    close();
  }
});

test("resource links admit only explicit web URLs without embedded credentials", () => {
  expect(safeWebLink(" https://example.com/runbook ")).toBe("https://example.com/runbook");
  expect(safeWebLink("http://127.0.0.1:8090/w/test")).toBe("http://127.0.0.1:8090/w/test");
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/test",
    "https://user:password@example.com",
    "example.com",
    {},
    null,
  ])
    expect(safeWebLink(value)).toBeNull();
});
