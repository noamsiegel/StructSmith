import type { NodeShape } from "@structsmith/domain";

export function NodeSilhouette({
  shape,
  width,
  height,
  fill,
  stroke,
  selected,
  external,
}: {
  shape: NodeShape;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  selected: boolean;
  external: boolean;
}) {
  const outline =
    shape === "diamond"
      ? `M ${width / 2} 1 L ${width - 1} ${height / 2} L ${width / 2} ${height - 1} L 1 ${height / 2} Z`
      : shape === "cylinder"
        ? `M 1 12 C 1 -2 ${width - 1} -2 ${width - 1} 12 L ${width - 1} ${height - 12} C ${width - 1} ${height + 2} 1 ${height + 2} 1 ${height - 12} Z`
        : undefined;
  const body = outline ? (
    <path d={outline} vectorEffect="non-scaling-stroke" />
  ) : (
    <rect
      x={1}
      y={1}
      width={width - 2}
      height={height - 2}
      rx={shape === "terminal" ? 24 : 5}
      vectorEffect="non-scaling-stroke"
    />
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-node-shape={shape}
    >
      {selected && (
        <g fill={fill} stroke="var(--ring)" strokeWidth={4}>
          {body}
        </g>
      )}
      <g
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={external ? "5 3" : undefined}
      >
        {body}
        {shape === "cylinder" && (
          <path
            d={`M 1 12 C 1 26 ${width - 1} 26 ${width - 1} 12`}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {shape === "subprocess" && (
          <path
            d={`M 9 1 V ${height - 1} M ${width - 9} 1 V ${height - 1}`}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    </svg>
  );
}
