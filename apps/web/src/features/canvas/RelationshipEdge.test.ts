import { expect, test } from "bun:test";
import type { ControlPoint, RelationshipRouting } from "@structsmith/contracts";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import type { FlowNode } from "./graph";
import { LabelPlacementProvider } from "./LabelPlacement";
import { RelationshipArrow, RelationshipEdge } from "./RelationshipEdge";
import type { ImplementationStatus } from "./statusOverlay";
import "../../i18n";

test("automatic Own return path crosses other cards without detours while authored bends remain", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const elements = ["Come back", "Upload documents", "Act on insights", "Review insights"].map(
      (name) => services.elements.create(workspace.id, { kind: "workflowGroup", name }).result,
    );
    const [source, target] = elements;
    if (!source || !target) throw new Error("Missing Own return endpoints");
    const boxes = [
      { x: 2752, y: 400, width: 240, height: 184 },
      { x: 1472, y: 0, width: 240, height: 184 },
      { x: 2752, y: -48, width: 240, height: 280 },
      { x: 2096, y: -4, width: 240, height: 184 },
    ];
    const nodes: FlowNode[] = elements.map((element, index) => {
      const box = boxes[index];
      if (!box) throw new Error("Missing Own card dimensions");
      return {
        id: element.id,
        type: "element",
        position: { x: box.x, y: box.y },
        measured: { width: box.width, height: box.height },
        data: {
          element,
          severity: null,
          locked: false,
          showFullTitles: true,
          showDescriptions: true,
          minimumHeight: box.height,
          status: null,
        },
      };
    });
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const flowProps = { initialNodes: nodes, children: null };
    const labelProps = { nodes, children: null };
    const render = (controlPoints: ControlPoint[]) =>
      renderToStaticMarkup(
        createElement(
          ReactFlowProvider,
          flowProps,
          createElement(
            LabelPlacementProvider,
            labelProps,
            createElement(RelationshipEdge, {
              id: relationship.id,
              source: source.id,
              target: target.id,
              sourceX: 2991,
              sourceY: 492,
              targetX: 1601,
              targetY: 183,
              sourcePosition: Position.Right,
              targetPosition: Position.Bottom,
              selectable: true,
              deletable: true,
              data: {
                status: null,
                relationship,
                tags: [],
                implied: false,
                label: "",
                count: 1,
                routing: "orthogonal",
                showLabel: false,
                placement: {
                  viewId: "view",
                  relationshipId: relationship.id,
                  hidden: false,
                  labelPosition: null,
                  controlPoints,
                  presentation: { targetFraction: 128 / 238 },
                },
              },
            }),
          ),
        ),
      );
    // FigJam-like: "Act on insights" sits between the endpoints; the route crosses it.
    expect(render([])).toContain('d="M 2991,492 L 3015,492 L 3015,207 L 1601,207 L 1601,183"');
    expect(
      render([
        { x: 3100, y: 492 },
        { x: 3100, y: 300 },
        { x: 1601, y: 300 },
      ]),
    ).toContain('d="M 2991,492 L 3100,492 L 3100,300 L 1601,300 L 1601,183"');
  } finally {
    close();
  }
});

test("visible connector path applies configured color, width, dash, route and status", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Source",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Target",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const render = (
      status: ImplementationStatus | null,
      opacity?: number,
      color: string | null = "#123456",
      routing: RelationshipRouting = "straight",
      controlPoints: ControlPoint[] = [{ x: 0, y: 100 }],
    ) =>
      renderToStaticMarkup(
        createElement(
          ReactFlowProvider,
          null,
          createElement(RelationshipEdge, {
            id: relationship.id,
            style: opacity === undefined ? undefined : { opacity },
            source: source.id,
            target: target.id,
            sourceX: 0,
            sourceY: 0,
            targetX: 100,
            targetY: 100,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            selectable: true,
            deletable: true,
            data: {
              status,
              relationship,
              tags: relationship.tags,
              implied: false,
              label: "",
              count: 1,
              routing,
              showLabel: true,
              placement: {
                viewId: "view",
                relationshipId: relationship.id,
                hidden: false,
                labelPosition: 0.25,
                controlPoints,
                presentation: {
                  color: color ?? undefined,
                  strokeWidth: 4,
                  strokeStyle: "dotted",
                  sourceArrow: "arrow",
                  targetArrow: "arrowclosed",
                },
              },
            },
          }),
        ),
      );
    const html = render(null);
    expect(html).toContain("stroke-width:4");
    expect(html).toContain("stroke-dasharray:1 4");
    expect(html).toContain("stroke:#123456");
    expect(html).toContain('d="M 0,0 L 0,100 L 100,100"');
    const orthogonal = render(null, undefined, null, "orthogonal", [
      { x: 40, y: 20 },
      { x: 40, y: 80 },
    ]);
    expect(orthogonal).toContain('d="M 0,0 L 40,0 L 40,100 L 100,100"');
    expect(render(null, undefined, null, "orthogonal", [])).not.toMatch(/d="M [^"]*[QC]/);
    const live = render("live", undefined, null);
    expect(live).toContain("stroke:var(--status-live)");
    expect(live).not.toContain("stroke-dasharray");
    const planned = render("planned", undefined, null);
    expect(planned).toContain("stroke:var(--status-planned)");
    expect(planned).toContain("stroke-dasharray:5 4");
    expect(render("conflict", undefined, null)).toContain("stroke:var(--muted-foreground)");
    expect(render("live")).toContain("stroke:#123456");
    expect(render(null)).toBe(html);
    const dimmed = render(null, 0.25);
    expect(dimmed).toMatch(/<path[^>]*style="[^"]*opacity:0\.25/);
  } finally {
    close();
  }
});

test("elevated arrowheads retain direction, zoom-independent size, halo and configured style", () => {
  const props = {
    endpoint: "target" as const,
    point: { x: 100, y: 50 },
    neighbour: { x: 100, y: 20 },
    stroke: "#123456",
    zoom: 0.5,
    opacity: 0.7,
  };
  const filled = renderToStaticMarkup(
    createElement(RelationshipArrow, { ...props, arrow: "arrowclosed" }),
  );
  expect(filled).toContain('data-connector-arrow="target"');
  expect(filled).toContain("translate(100px, 50px) rotate(90deg)");
  expect(filled).toContain('d="M -20,-10 L 0,0 L -20,10 Z"');
  expect(filled).toContain('fill="#123456"');
  expect(filled).toContain('stroke="var(--canvas)" stroke-width="10"');
  expect(filled).toContain('stroke="#123456" stroke-width="3"');
  expect(filled).toContain("opacity:0.7");
  const open = renderToStaticMarkup(
    createElement(RelationshipArrow, {
      ...props,
      endpoint: "source",
      arrow: "arrow",
      point: { x: 0, y: 20 },
      neighbour: { x: 50, y: 20 },
      zoom: 1,
    }),
  );
  expect(open).toContain("rotate(180deg)");
  expect(open).toContain('d="M -10,-5 L 0,0 L -10,5" fill="none"');
  expect(renderToStaticMarkup(createElement(RelationshipArrow, { ...props, arrow: "none" }))).toBe(
    "",
  );
});
