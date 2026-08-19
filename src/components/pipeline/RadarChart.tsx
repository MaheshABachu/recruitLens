interface RadarAxis {
  label: string;
  value: number; // 0-100
}

interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
}

const RINGS = [0.25, 0.5, 0.75, 1];
const LABEL_RING = 1.1;

export function RadarChart({ axes, size = 460 }: RadarChartProps) {
  const center = size / 2;
  // Radius is a fraction of size, not size/2 minus a fixed margin — the
  // remaining space is reserved for axis labels so long topic names (e.g.
  // "Breadth-First Search") stay inside the box instead of bleeding past its
  // edge. Since the <svg> scales via width/height 100%, this ratio holds at
  // any rendered container size — 0.3 fills the box while still leaving
  // enough margin for labels at the sizes this actually renders at.
  const radius = size * 0.45;
  const n = axes.length;

  const angleFor = (i: number) => -Math.PI / 2 + i * ((2 * Math.PI) / n);
  const pointFor = (i: number, fraction: number) => {
    const angle = angleFor(i);
    return { x: center + radius * fraction * Math.cos(angle), y: center + radius * fraction * Math.sin(angle) };
  };

  const dataPoints = axes.map((axis, i) => pointFor(i, Math.max(0, Math.min(100, axis.value)) / 100));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      className="radar-chart"
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      overflow="visible"
      aria-hidden="true"
    >
      {RINGS.map((fraction) => {
        const ringPoints = axes.map((_, i) => pointFor(i, fraction));
        return (
          <polygon
            key={fraction}
            points={ringPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--border)"
          />
        );
      })}

      {axes.map((_, i) => {
        const outer = pointFor(i, 1);
        return <line key={i} x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="var(--border)" />;
      })}

      <polygon points={dataPolygon} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />

      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--accent)" />
      ))}

      {axes.map((axis, i) => {
        const labelPoint = pointFor(i, LABEL_RING);
        const cos = Math.cos(angleFor(i));
        const textAnchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text
            key={axis.label}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fill="var(--text-dim)"
            fontSize="16"
            fontFamily="var(--font-ui)"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
