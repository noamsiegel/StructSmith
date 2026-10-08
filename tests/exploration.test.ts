import { expect, test } from "bun:test";
import { resolveRelationshipsForView } from "@structsmith/domain";
import { deriveExpandedView, preferredDetailView } from "../packages/domain/src/exploration";
import { estimateElementSize } from "../packages/domain/src/layout";
import { createTestContext } from "./helpers";

function fixture() {
  const context = createTestContext();
  const { services } = context;
  const workspace = services.workspaces.create({ name: "Exploration" });
  const root = services.elements.create(workspace.id, {
    kind: "workflowGroup",
    name: "Capture",
  }).result;
  const chain = [root];
  for (let i = 1; i < 5; i += 1) {
    chain.push(
      services.elements.create(workspace.id, {
        kind: "workflowGroup",
        name: `Level ${i}`,
        parentId: chain[i - 1]?.id,
      }).result,
    );
  }
  const external = services.elements.create(workspace.id, {
    kind: "action",
    name: "Charge",
  }).result;
  const overview = services.views.create(workspace.id, {
    name: "Overview",
    kind: "workflow",
    elementIds: [root.id, external.id],
  }).result;
  const detail = (name: string) =>
    services.views.create(workspace.id, {
      name,
      kind: "workflow",
      scopeElementId: root.id,
    }).result;
  return {
    ...context,
    workspace,
    root,
    chain,
    external,
    overview,
    detail,
    elements: services.elements.list(workspace.id),
    view: services.views.get(overview.id),
  };
}

test("a remembered scoped view bypasses the chooser; stale or unrelated preferences do not", () => {
  const f = fixture();
  try {
    const first = f.detail("A");
    const second = f.detail("B");
    const views = f.services.views.list(f.workspace.id);
    expect(preferredDetailView(f.root, views, f.overview.id, { [f.root.id]: second.id })?.id).toBe(
      second.id,
    );
    expect(preferredDetailView(f.root, views, f.overview.id, {})).toBeNull();
    expect(
      preferredDetailView(f.root, views, f.overview.id, { [f.root.id]: "deleted" }),
    ).toBeNull();
    expect(
      preferredDetailView(f.root, views, f.overview.id, { [f.root.id]: f.overview.id }),
    ).toBeNull();
    expect(preferredDetailView(f.root, views, first.id, { [f.root.id]: first.id })?.id).toBe(
      second.id,
    );
    expect(preferredDetailView(f.root, [first], f.overview.id, {})?.id).toBe(first.id);
  } finally {
    f.close();
  }
});

test("inline expansion reveals exactly one level without model writes or saved placement changes", () => {
  const f = fixture();
  try {
    const before = f.services.model.get(f.workspace.id);
    const result = deriveExpandedView(f.view, f.elements, new Set([f.root.id]));
    const child = f.chain[1];
    if (!child) throw new Error("Missing child");
    expect([...result.temporaryElementIds]).toEqual([child.id]);
    expect(
      result.view.elements.filter((entry) => !result.temporaryElementIds.has(entry.elementId)),
    ).toEqual(f.view.elements);
    expect(
      result.view.elements.find((entry) => result.temporaryElementIds.has(entry.elementId))?.locked,
    ).toBe(true);
    expect(result.view.elements).toHaveLength(3);
    expect(f.services.model.get(f.workspace.id)).toEqual(before);
    expect(deriveExpandedView(f.view, f.elements, new Set()).view).toBe(f.view);
  } finally {
    f.close();
  }
});

test("selective nested expansion stops after four visible levels and rejects disconnected requests", () => {
  const f = fixture();
  try {
    const result = deriveExpandedView(f.view, f.elements, new Set(f.chain.map((item) => item.id)));
    expect([...result.temporaryElementIds]).toEqual(f.chain.slice(1, 4).map((item) => item.id));
    expect([...result.expandedElementIds]).toEqual(f.chain.slice(0, 3).map((item) => item.id));
    expect(Math.max(...result.depths.values())).toBe(3);
    expect(result.view.elements.some((entry) => entry.elementId === f.chain[4]?.id)).toBe(false);
    expect(deriveExpandedView(f.view, f.elements, new Set([f.chain[2]?.id ?? ""])).view).toBe(
      f.view,
    );
  } finally {
    f.close();
  }
});

test("existing child placements are reused, and explicitly hidden children remain hidden", () => {
  const f = fixture();
  try {
    const child = f.chain[1];
    if (!child) throw new Error("Missing child");
    const placement = f.view.elements[0];
    if (!placement) throw new Error("Missing placement");
    const entry = { ...placement, elementId: child.id, x: 123, y: 456, hidden: true };
    const view = { ...f.view, elements: [...f.view.elements, entry] };
    const result = deriveExpandedView(view, f.elements, new Set([f.root.id, child.id]));
    expect(result.temporaryElementIds.size).toBe(0);
    expect(result.view.elements.find((item) => item.elementId === child.id)).toEqual(entry);
    expect(result.depths.has(child.id)).toBe(false);
    const visibleView = {
      ...view,
      elements: view.elements.map((item) => ({ ...item, hidden: false })),
    };
    const visible = deriveExpandedView(visibleView, f.elements, new Set([f.root.id]));
    expect(visible.temporaryElementIds.size).toBe(0);
    expect(visible.view.elements.find((item) => item.elementId === child.id)?.x).toBe(123);
  } finally {
    f.close();
  }
});

test("child routes lift to the collapsed group and expose their real endpoint after expansion", () => {
  const f = fixture();
  try {
    const child = f.chain[1];
    if (!child) throw new Error("Missing child");
    const relation = f.services.relationships.create(f.workspace.id, {
      sourceElementId: child.id,
      targetElementId: f.external.id,
      description: "Ledger ready",
    }).result;
    const direct = f.services.relationships.create(f.workspace.id, {
      sourceElementId: f.root.id,
      targetElementId: f.external.id,
      description: "Capture state",
    }).result;
    const routes = (view: typeof f.view) =>
      resolveRelationshipsForView(
        f.elements,
        [relation, direct],
        new Set(view.elements.filter((entry) => !entry.hidden).map((entry) => entry.elementId)),
      );
    expect(routes(f.view).find((edge) => edge.implied)?.sourceElementId).toBe(f.root.id);
    const expanded = routes(deriveExpandedView(f.view, f.elements, new Set([f.root.id])).view);
    expect(expanded.find((edge) => edge.id === relation.id)?.sourceElementId).toBe(child.id);
    expect(expanded.find((edge) => edge.id === direct.id)?.sourceElementId).toBe(f.root.id);
    expect(expanded.every((edge) => !edge.implied)).toBe(true);
  } finally {
    f.close();
  }
});

test("temporary children avoid existing cards and each other", () => {
  const f = fixture();
  try {
    const sibling = f.services.elements.create(f.workspace.id, {
      kind: "action",
      parentId: f.root.id,
      name: "Second child",
    }).result;
    const elements = [...f.elements, sibling];
    const result = deriveExpandedView(f.view, elements, new Set([f.root.id]));
    const children = result.view.elements.filter((item) =>
      result.temporaryElementIds.has(item.elementId),
    );
    expect(children).toHaveLength(2);
    expect(children[0]?.y).not.toBe(children[1]?.y);
    expect(
      children.every((child) =>
        f.view.elements.every((saved) => child.x !== saved.x || child.y !== saved.y),
      ),
    ).toBe(true);
  } finally {
    f.close();
  }
});

test("inline children sit below the parent header without enveloping a peer to the right", () => {
  const f = fixture();
  try {
    const view = {
      ...f.view,
      elements: f.view.elements.map((entry) => ({
        ...entry,
        x: entry.elementId === f.root.id ? 100 : 500,
        y: 200,
      })),
    };
    const result = deriveExpandedView(view, f.elements, new Set([f.root.id]));
    const child = result.view.elements.find((entry) =>
      result.temporaryElementIds.has(entry.elementId),
    );
    if (!child) throw new Error("Missing child");
    expect(child.x).toBe(124);
    expect(child.y).toBe(200);
    const size = estimateElementSize(f.chain[1], view.settings, child);
    expect(child.x + size.width + 24).toBeLessThan(500);
    expect(
      result.view.elements.filter((entry) => !result.temporaryElementIds.has(entry.elementId)),
    ).toEqual(view.elements);
  } finally {
    f.close();
  }
});

test("nested expansion reserves the entire subtree before placing its sibling", () => {
  const f = fixture();
  try {
    const sibling = f.services.elements.create(f.workspace.id, {
      kind: "action",
      parentId: f.root.id,
      name: "Sibling",
    }).result;
    const view = {
      ...f.view,
      elements: f.view.elements.map((entry) => ({
        ...entry,
        x: entry.elementId === f.root.id ? 100 : 700,
        y: 200,
      })),
    };
    const elements = [...f.elements, sibling];
    const result = deriveExpandedView(
      view,
      elements,
      new Set(f.chain.map((element) => element.id)),
    );
    const placements = new Map(result.view.elements.map((entry) => [entry.elementId, entry]));
    const first = placements.get(f.chain[1]?.id ?? "");
    const second = placements.get(f.chain[2]?.id ?? "");
    const third = placements.get(f.chain[3]?.id ?? "");
    const peer = placements.get(sibling.id);
    if (!first || !second || !third || !peer) throw new Error("Missing subtree");
    expect(first.x).toBe(124);
    expect(second.x).toBe(first.x + 24);
    expect(second.y).toBe(first.y + 48);
    expect(third.y).toBe(second.y + 48);
    const leaf = estimateElementSize(f.chain[3], view.settings, third);
    expect(peer.y).toBeGreaterThanOrEqual(third.y + leaf.height + 48);
    expect(peer.x).toBe(first.x);
    expect(
      result.view.elements.filter((entry) => !result.temporaryElementIds.has(entry.elementId)),
    ).toEqual(view.elements);
  } finally {
    f.close();
  }
});

test("a temporary subtree clears overlapping saved cards using its full width", () => {
  const f = fixture();
  try {
    const view = {
      ...f.view,
      elements: f.view.elements.map((entry) => ({
        ...entry,
        x: entry.elementId === f.root.id ? 100 : 390,
        y: 200,
      })),
    };
    const result = deriveExpandedView(
      view,
      f.elements,
      new Set(f.chain.map((element) => element.id)),
    );
    const first = result.view.elements.find((entry) => entry.elementId === f.chain[1]?.id);
    const saved = view.elements.find((entry) => entry.elementId === f.external.id);
    if (!first || !saved) throw new Error("Missing placements");
    const peerSize = estimateElementSize(f.external, view.settings, saved);
    expect(first.x).toBe(124);
    expect(first.y).toBeGreaterThanOrEqual(saved.y + peerSize.height + 32);
    expect(result.view.elements.find((entry) => entry.elementId === saved.elementId)).toEqual(
      saved,
    );
  } finally {
    f.close();
  }
});
