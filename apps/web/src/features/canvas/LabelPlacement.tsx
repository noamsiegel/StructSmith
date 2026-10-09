import type { ControlPoint } from "@structsmith/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { boundaryHeaderHeight, type FlowNode } from "./graph";
import { clearRelationshipLabel, type LabelBox } from "./labelClearance";
import type { RouteObstacle } from "./orthogonalRouting";

interface LabelRequest {
  showLabel: boolean;
  obstacles: readonly LabelBox[];
  points: readonly ControlPoint[];
  desired: ControlPoint;
  width: number;
  height: number;
}

export function labelObstacles(
  nodes: readonly FlowNode[],
  headerHeights: ReadonlyMap<string, number> = new Map(),
): LabelBox[] {
  return nodes
    .filter((node) => !node.hidden)
    .map((node) => {
      const width = node.measured?.width ?? node.width ?? 220;
      const height = node.measured?.height ?? node.height ?? Number(node.data.minimumHeight ?? 96);
      if (node.type === "boundary") {
        const header =
          headerHeights.get(node.id) ??
          boundaryHeaderHeight(node.data.name, width, node.data.section);
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
  headers: readonly LabelBox[];
  routingObstacles: readonly RouteObstacle[];
  register: (id: string, request: LabelRequest | null) => void;
  registerHeader: (id: string, height: number | null) => void;
} | null>(null);

export function LabelPlacementProvider({
  nodes,
  children,
}: {
  nodes: readonly FlowNode[];
  children: ReactNode;
}) {
  const [requests, setRequests] = useState(new Map<string, LabelRequest>());
  const [headerHeights, setHeaderHeights] = useState(new Map<string, number>());
  const registerHeader = useCallback((id: string, height: number | null) => {
    setHeaderHeights((current) => {
      if ((current.get(id) ?? null) === height) return current;
      const next = new Map(current);
      if (height !== null) next.set(id, height);
      else next.delete(id);
      return next;
    });
  }, []);
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
    const obstacles = [
      ...labelObstacles(nodes, headerHeights),
      ...[...requests.values()].flatMap((request) => request.obstacles),
    ];
    const positions = new Map<string, ControlPoint>();
    // Stable ordering prevents labels swapping places as their edges rerender.
    for (const [id, request] of [...requests].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!request.showLabel) continue;
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
  }, [nodes, requests, headerHeights]);
  const headers = useMemo(
    () =>
      labelObstacles(
        nodes.filter((node) => node.type === "boundary"),
        headerHeights,
      ),
    [nodes, headerHeights],
  );
  const routingObstacles = useMemo(
    () =>
      nodes
        .filter((node) => !node.hidden)
        .flatMap((node) =>
          labelObstacles([node], headerHeights).map((box) => ({ id: node.id, ...box })),
        ),
    [nodes, headerHeights],
  );
  const routingCache = useRef(routingObstacles);
  if (JSON.stringify(routingCache.current) !== JSON.stringify(routingObstacles))
    routingCache.current = routingObstacles;
  const stableRoutingObstacles = routingCache.current;
  const value = useMemo(
    () => ({
      positions,
      headers,
      routingObstacles: stableRoutingObstacles,
      register,
      registerHeader,
    }),
    [positions, headers, stableRoutingObstacles, register, registerHeader],
  );
  return <LabelPlacementContext.Provider value={value}>{children}</LabelPlacementContext.Provider>;
}

export function useLabelHeader(id: string) {
  const headerRef = useRef<HTMLDivElement>(null);
  const register = useContext(LabelPlacementContext)?.registerHeader;
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header || !register) return;
    const measure = () =>
      register(
        id,
        header.offsetHeight + (Number.parseFloat(getComputedStyle(header).marginBottom) || 0),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      register(id, null);
    };
  }, [id, register]);
  return headerRef;
}

export function useLabelPlacement(id: string, request: LabelRequest | null) {
  const context = useContext(LabelPlacementContext);
  const register = context?.register;
  useLayoutEffect(() => {
    register?.(id, request);
  }, [id, request, register]);
  useLayoutEffect(() => () => register?.(id, null), [id, register]);
  return { point: context?.positions.get(id) ?? null, headers: context?.headers ?? [] };
}

export function useRoutingObstacles() {
  return useContext(LabelPlacementContext)?.routingObstacles ?? [];
}
