import type { ControlPoint } from "@structsmith/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { boundaryHeaderHeight, type FlowNode } from "./graph";
import { clearRelationshipLabel, type LabelBox } from "./labelClearance";

interface LabelRequest {
  points: readonly ControlPoint[];
  desired: ControlPoint;
  width: number;
  height: number;
}

export function labelObstacles(nodes: readonly FlowNode[]): LabelBox[] {
  return nodes
    .filter((node) => !node.hidden)
    .map((node) => {
      const width = node.measured?.width ?? node.width ?? 220;
      const height = node.measured?.height ?? node.height ?? Number(node.data.minimumHeight ?? 96);
      if (node.type === "boundary") {
        const header = boundaryHeaderHeight(node.data.name, width, node.data.section);
        return {
          x: node.position.x,
          y: node.position.y - (node.data.section ? header : 0),
          width,
          height: header,
        };
      }
      return { ...node.position, width, height };
    });
}

const LabelPlacementContext = createContext<{
  positions: ReadonlyMap<string, ControlPoint>;
  register: (id: string, request: LabelRequest | null) => void;
} | null>(null);

export function LabelPlacementProvider({
  nodes,
  children,
}: {
  nodes: readonly FlowNode[];
  children: ReactNode;
}) {
  const [requests, setRequests] = useState(new Map<string, LabelRequest>());
  const register = useCallback((id: string, request: LabelRequest | null) => {
    setRequests((current) => {
      if (JSON.stringify(current.get(id) ?? null) === JSON.stringify(request)) return current;
      const next = new Map(current);
      if (request) next.set(id, request);
      else next.delete(id);
      return next;
    });
  }, []);
  const positions = useMemo(() => {
    const obstacles = labelObstacles(nodes);
    const positions = new Map<string, ControlPoint>();
    // Stable ordering prevents labels swapping places as their edges rerender.
    for (const [id, request] of [...requests].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const point = clearRelationshipLabel(request.points, request.desired, request, obstacles);
      positions.set(id, point);
      obstacles.push({
        x: point.x - request.width / 2,
        y: point.y - request.height / 2,
        width: request.width,
        height: request.height,
      });
    }
    return positions;
  }, [nodes, requests]);
  const value = useMemo(() => ({ positions, register }), [positions, register]);
  return <LabelPlacementContext.Provider value={value}>{children}</LabelPlacementContext.Provider>;
}

export function useLabelPlacement(id: string, request: LabelRequest | null): ControlPoint | null {
  const context = useContext(LabelPlacementContext);
  const register = context?.register;
  useLayoutEffect(() => {
    register?.(id, request);
  }, [id, request, register]);
  useLayoutEffect(() => () => register?.(id, null), [id, register]);
  return context?.positions.get(id) ?? null;
}
