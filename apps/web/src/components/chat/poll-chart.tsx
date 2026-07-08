"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { PollData } from "@/lib/api/services/message-service";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function PollChart({ poll }: { poll: PollData }) {
  const data = poll.options.map((o) => ({ name: o.text, value: o.voteCount }));
  const hasVotes = poll.totalVotes > 0;

  if (poll.chartType === "BAR") {
    return (
      <ResponsiveContainer width="100%" height={Math.max(140, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <XAxis type="number" hide allowDecimals={false} domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="value"
            radius={[0, 6, 6, 0]}
            isAnimationActive
            animationDuration={450}
            animationEasing="ease-out"
            minPointSize={hasVotes ? 2 : 0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={hasVotes ? data : data.map((d) => ({ ...d, value: 1 }))}
          dataKey="value"
          nameKey="name"
          innerRadius={poll.chartType === "DONUT" ? 42 : 0}
          outerRadius={75}
          paddingAngle={hasVotes ? 2 : 0}
          isAnimationActive
          animationDuration={450}
          animationEasing="ease-out"
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={hasVotes ? 1 : 0.35} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
