import { expect, test } from "bun:test";
import type { ControlPoint, RelationshipRouting } from "@structsmith/contracts";
import { Position, ReactFlowProvider } from "@xyflow/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import { RelationshipEdge } from "./RelationshipEdge";
import type { ImplementationStatus } from "./statusOverlay";
import "../../i18n";

test("visible SVG applies configured color, width, dash and both arrowheads", () => {
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
    expect(html).toContain('marker-start="url(#relationship-');
    expect(html).toContain('marker-end="url(#relationship-');
    expect(html).toContain('fill="#123456"');
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
    expect(live).toContain('fill="var(--status-live)"');
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
