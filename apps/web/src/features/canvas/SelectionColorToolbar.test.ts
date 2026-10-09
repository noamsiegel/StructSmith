import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import i18n from "../../i18n";
import { useEditorStore } from "../../store/editor";
import { buildGraph } from "./graph";
import { SelectionColorToolbar } from "./SelectionColorToolbar";

test("Reset route enables manual connectors, retains presentation and restores bends on Undo", async () => {
  const { services, close } = createTestContext();
  const initialState = useEditorStore.getInitialState();
  const selection = initialState.selection;
  const language = i18n.language;
  try {
    await i18n.changeLanguage("en");
    const workspace = createWorkspace(services);
    const elements = ["Source", "Target"].map(
      (name) => services.elements.create(workspace.id, { kind: "action", name }).result,
    );
    const [source, target] = elements;
    if (!source || !target) throw new Error("Missing connector endpoints");
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Manual route",
      elementIds: elements.map((element) => element.id),
    }).result;
    services.views.saveLayout(
      workspace.id,
      view.id,
      [],
      [
        {
          relationshipId: relationship.id,
          controlPoints: [
            { x: 400, y: 0 },
            { x: 400, y: 200 },
          ],
          labelPosition: 0.75,
          presentation: {
            color: "#9747FF",
            strokeWidth: 3,
            strokeStyle: "dashed",
            sourceArrow: "arrow",
            targetArrow: "arrowclosed",
            sourceSide: "right",
            sourceFraction: 0.25,
            targetSide: "top",
            targetPoint: { x: 120, y: 300 },
            labelOffset: { x: 12, y: 8 },
          },
        },
      ],
    );
    const before = services.views.get(view.id).relationships;
    // Server rendering reads Zustand's initial snapshot.
    initialState.selection = { type: "relationship", id: relationship.id };
    const render = () => {
      const detail = services.views.get(view.id);
      const graph = buildGraph({
        view: detail,
        elements,
        relationships: [relationship],
        records: [],
      });
      return renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          createElement(SelectionColorToolbar, {
            workspaceId: workspace.id,
            view: detail,
            ...graph,
          }),
        ),
      ).match(/<button[^>]*title="Clear manual bends[^>]*>[\s\S]*?<\/button>/)?.[0];
    };
    expect(render()).toContain("Reset route");
    expect(render()).not.toContain('disabled=""');
    const command = services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "setViewRelationships",
            viewId: view.id,
            relationships: [{ relationshipId: relationship.id, controlPoints: [] }],
          },
        ],
      },
      "ui",
    );
    expect(services.views.get(view.id).relationships).toEqual(
      before.map((row) => ({ ...row, controlPoints: [] })),
    );
    expect(render()).toContain('disabled=""');
    if (!command.snapshotId) throw new Error("Missing reset undo snapshot");
    services.snapshots.restore(command.snapshotId);
    expect(services.views.get(view.id).relationships).toEqual(before);
  } finally {
    close();
    initialState.selection = selection;
    await i18n.changeLanguage(language);
  }
});
