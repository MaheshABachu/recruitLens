import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
} from "recharts";

interface RadarAxis {
  label: string;
  value: number; // 0-100
}

interface RadarChartProps {
  axes: RadarAxis[];
}

const LABEL_TRUNCATE_LENGTH = 14;

// Long topic names ("Breadth-First Search", "Heap (Priority Queue)") are the
// reason the old hand-rolled chart overlapped at smaller sizes — truncating
// here is safe because the full name is always visible in the adjacent bar
// list, this axis label is just an at-a-glance pointer.
function AxisTick({ x, y, payload, textAnchor }: any) {
  const label = payload.value as string;
  const display = label.length > LABEL_TRUNCATE_LENGTH ? `${label.slice(0, LABEL_TRUNCATE_LENGTH - 1)}…` : label;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill="var(--text-dim)" fontSize={11} fontFamily="var(--font-ui)">
      <title>{label}</title>
      {display}
    </text>
  );
}

export function RadarChart({ axes }: RadarChartProps) {
  const data = axes.map((axis) => ({ topic: axis.label, score: Math.max(0, Math.min(100, axis.value)) }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <RechartsRadarChart data={data} outerRadius="85%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="topic" tick={AxisTick} tickLine={false} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
        <Radar
          name="Topic score"
          dataKey="score"
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.35}
          strokeWidth={2}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}
