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
  headerSizes: ReadonlyMap<string, Pick<LabelBox, "width" | "height">> = new Map(),
): LabelBox[] {
  return nodes
    .filter((node) => !node.hidden)
    .map((node) => {
      const width = node.measured?.width ?? node.width ?? 220;
      const height = node.measured?.height ?? node.height ?? Number(node.data.minimumHeight ?? 96);
      if (node.type === "boundary") {
        const measuredHeader = headerSizes.get(node.id);
        const header =
          measuredHeader?.height ?? boundaryHeaderHeight(node.data.name, width, node.data.section);
        return {
          x: node.position.x,
          y: node.position.y - (node.data.section ? header : 0),
          width: node.data.section ? (measuredHeader?.width ?? width) : width,
          height: header,
        };
      }
      return { ...node.position, width, height };
    });
}

const LabelPlacementContext = createContext<{
  positions: ReadonlyMap<string, ControlPoint>;
  headers: readonly LabelBox[];
  register: (id: string, request: LabelRequest | null) => void;
  registerHeader: (id: string, size: Pick<LabelBox, "width" | "height"> | null) => void;
} | null>(null);

export function LabelPlacementProvider({
  nodes,
  children,
}: {
  nodes: readonly FlowNode[];
  children: ReactNode;
}) {
  const [requests, setRequests] = useState(new Map<string, LabelRequest>());
  const [headerSizes, setHeaderSizes] = useState(
    new Map<string, Pick<LabelBox, "width" | "height">>(),
  );
  const registerHeader = useCallback(
    (id: string, size: Pick<LabelBox, "width" | "height"> | null) => {
      setHeaderSizes((current) => {
        const previous = current.get(id) ?? null;
        if (previous?.width === size?.width && previous?.height === size?.height) return current;
        const next = new Map(current);
        if (size !== null) next.set(id, size);
        else next.delete(id);
        return next;
      });
    },
    [],
  );
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
      ...labelObstacles(nodes, headerSizes),
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
  }, [nodes, requests, headerSizes]);
  const headers = useMemo(
    () =>
      labelObstacles(
        nodes.filter((node) => node.type === "boundary"),
        headerSizes,
      ),
    [nodes, headerSizes],
  );
  const value = useMemo(
    () => ({
      positions,
      headers,
      register,
      registerHeader,
    }),
    [positions, headers, register, registerHeader],
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
      register(id, {
        width: header.offsetWidth,
        height:
          header.offsetHeight + (Number.parseFloat(getComputedStyle(header).marginBottom) || 0),
      });
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
