import { expect, test } from "bun:test";
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
    const render = (status: ImplementationStatus | null) =>
      renderToStaticMarkup(
        createElement(
          ReactFlowProvider,
          null,
          createElement(RelationshipEdge, {
            id: relationship.id,
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
              routing: "straight",
              showLabel: true,
              placement: {
                viewId: "view",
                relationshipId: relationship.id,
                hidden: false,
                labelPosition: 0.25,
                controlPoints: [{ x: 0, y: 100 }],
                presentation: {
                  color: "#123456",
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
    const live = render("live");
    expect(live).toContain("stroke:var(--status-live)");
    expect(live).not.toContain("stroke-dasharray");
    expect(live).toContain('fill="var(--status-live)"');
    const planned = render("planned");
    expect(planned).toContain("stroke:var(--status-planned)");
    expect(planned).toContain("stroke-dasharray:5 4");
    expect(render("conflict")).toContain("stroke:var(--muted-foreground)");
    expect(render(null)).toBe(html);
  } finally {
    close();
  }
});
