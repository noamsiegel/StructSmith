import { Handle, Position } from "@xyflow/react";
import { sourceHandleFor, targetHandleFor } from "./graph";

export function ConnectionHandles({
  diamond = false,
  sloped = false,
  control,
  width = 220,
}: {
  diamond?: boolean;
  sloped?: boolean;
  control?: "start" | "end" | "bar";
  width?: number;
}) {
  return (
    <>
      {(["target", "source"] as const).flatMap((type) =>
        (type === "source"
          ? (["right", "left", "top", "bottom"] as const)
          : (["left", "right", "top", "bottom"] as const)
        ).flatMap((side) =>
          [1, 0, 2].map((slot) => {
            const horizontal = side === "top" || side === "bottom";
            return (
              <Handle
                key={`${type}-${side}-${slot}`}
                type={type}
                position={
                  {
                    left: Position.Left,
                    right: Position.Right,
                    top: Position.Top,
                    bottom: Position.Bottom,
                  }[side]
                }
                id={
                  type === "source"
                    ? sourceHandleFor(side, "LR", slot)
                    : targetHandleFor(side, "LR", slot)
                }
                style={
                  horizontal
                    ? {
                        left: `${25 + slot * 25}%`,
                        ...(diamond ? { [side]: slot === 1 ? 0 : "25%" } : {}),
                        ...(control
                          ? {
                              left:
                                control === "bar"
                                  ? `${25 + slot * 25}%`
                                  : width / 2 + (slot - 1) * 6,
                              top:
                                side === "top"
                                  ? control === "bar"
                                    ? 10
                                    : 2
                                  : control === "bar"
                                    ? 22
                                    : 30,
                              bottom: "auto",
                            }
                          : {}),
                      }
                    : {
                        top: `${25 + slot * 25}%`,
                        ...(diamond ? { [side]: slot === 1 ? 0 : "25%" } : {}),
                        ...(sloped
                          ? { [side]: side === "left" ? 25 - (slot + 1) * 6 : 1 + (slot + 1) * 6 }
                          : {}),
                        ...(control
                          ? {
                              top: 16 + (slot - 1) * 4,
                              left:
                                side === "left"
                                  ? control === "bar"
                                    ? 0
                                    : width / 2 - 14
                                  : control === "bar"
                                    ? width
                                    : width / 2 + 14,
                              right: "auto",
                            }
                          : {}),
                      }
                }
              />
            );
          }),
        ),
      )}
    </>
  );
}
