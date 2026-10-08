import { Handle, Position } from "@xyflow/react";
import { sourceHandleFor, targetHandleFor } from "./graph";

export function ConnectionHandles() {
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
                style={horizontal ? { left: `${25 + slot * 25}%` } : { top: `${25 + slot * 25}%` }}
              />
            );
          }),
        ),
      )}
    </>
  );
}
