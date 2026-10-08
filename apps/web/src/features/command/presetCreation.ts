import type { ArchitectureOperationInput } from "@structsmith/contracts";
import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH, type ElementPreset } from "@structsmith/domain";

export function presetCreationOperations(
  preset: ElementPreset,
  name: string,
  viewId: string | null,
  boundaryId: string | null = null,
  point?: { x: number; y: number },
): ArchitectureOperationInput[] {
  return [
    {
      op: "createElement",
      ref: "created",
      data: {
        kind: preset.kind,
        role: preset.role,
        name,
        external: preset.external ?? false,
        technology: preset.technology ?? null,
      },
    },
    ...(viewId
      ? [
          {
            op: "setViewElements" as const,
            viewId,
            elementIds: ["@created"],
            mode: "add" as const,
          },
          ...(point
            ? [
                {
                  op: "setLayout" as const,
                  viewId,
                  entries: [
                    {
                      elementId: "@created",
                      x: Math.round(point.x - DEFAULT_NODE_WIDTH / 2),
                      y: Math.round(point.y - DEFAULT_NODE_HEIGHT / 2),
                      hidden: false,
                    },
                  ],
                },
              ]
            : []),
          ...(boundaryId
            ? [
                {
                  op: "setBoundaryMembers" as const,
                  boundaryId,
                  elementIds: ["@created"],
                  mode: "add" as const,
                },
              ]
            : []),
        ]
      : []),
  ];
}
