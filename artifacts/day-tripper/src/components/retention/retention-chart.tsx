import { useMemo } from 'react';
import type { RetentionObservation, RetentionSpeed } from '@workspace/api-client-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

type RetentionChartProps = {
  observations: RetentionObservation[];
  unit: string;
  speed: RetentionSpeed;
};

type RetentionChartPoint = {
  dateKey: string;
  label: string;
  actual: number | null;
  estimate: number | null;
  day: number;
};

const chartConfig = {
  actual: { label: 'Recorded result', color: 'hsl(var(--primary))' },
  estimate: { label: 'Estimated freshness', color: 'hsl(var(--accent))' },
} satisfies ChartConfig;

const defaultHalfLifeDays: Record<RetentionSpeed, number> = {
  slow: 42,
  moderate: 24,
  fast: 12,
};

function compactDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );
}

export function RetentionChart({ observations, unit, speed }: RetentionChartProps) {
  const points = useMemo(() => {
    const sorted = [...observations].sort((a, b) => {
      const dateOrder = a.recordedDate.localeCompare(b.recordedDate);
      if (dateOrder !== 0) return dateOrder;
      const createdOrder = a.createdAt.localeCompare(b.createdAt);
      return createdOrder !== 0 ? createdOrder : a.id - b.id;
    });
    if (!sorted.length) return [];

    const firstDay = new Date(`${sorted[0].recordedDate}T12:00:00`).getTime();
    const effectiveAnchors: RetentionObservation[] = [];
    let highestValue = Number.NEGATIVE_INFINITY;
    for (const observation of sorted) {
      if (observation.value > highestValue) {
        effectiveAnchors.push(observation);
        highestValue = observation.value;
      }
    }

    const actualPoints: RetentionChartPoint[] = sorted.map((observation) => {
      const timestamp = new Date(`${observation.recordedDate}T12:00:00`).getTime();
      return {
        dateKey: observation.recordedDate,
        label: compactDate(observation.recordedDate),
        actual: observation.value,
        estimate: null,
        day: Math.round((timestamp - firstDay) / 86400000),
      };
    });

    const estimatePoints: RetentionChartPoint[] = effectiveAnchors.flatMap((anchor, index) => {
      const anchorTimestamp = new Date(`${anchor.recordedDate}T12:00:00`).getTime();
      const nextAnchor = effectiveAnchors[index + 1];
      const nextAnchorTimestamp = nextAnchor
        ? new Date(`${nextAnchor.recordedDate}T12:00:00`).getTime()
        : null;
      const halfLifeDays =
        anchor.curveHalfLifeDays ?? defaultHalfLifeDays[speed];
      const futureDays = [7, 14, 21, 30];
      const generatedDays = [0, ...futureDays].filter((day) => {
        const timestamp = anchorTimestamp + day * 86400000;
        return nextAnchorTimestamp === null || timestamp < nextAnchorTimestamp;
      });

      return generatedDays.map((day) => {
        const timestamp = anchorTimestamp + day * 86400000;
        const dateKey = new Date(timestamp).toISOString().slice(0, 10);
        return {
          dateKey,
          label: compactDate(dateKey),
          actual: null,
          estimate: Number((anchor.value * 2 ** (-day / halfLifeDays)).toFixed(2)),
          day: Math.round((timestamp - firstDay) / 86400000),
        };
      });
    });

    return [...actualPoints, ...estimatePoints].sort((a, b) => {
      const dayOrder = a.day - b.day;
      return dayOrder !== 0 ? dayOrder : (a.actual === null ? -1 : 1);
    });
  }, [observations, speed]);

  if (!observations.length) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-[22px] border border-dashed border-primary/25 bg-primary/[0.035] px-6 text-center">
        <div>
          <p className="font-display text-2xl tracking-[-0.03em]">Your first result will live here.</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Record an observation to see what you have built, in your own words and numbers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-border/75 bg-card/75 p-3 sm:p-5" data-testid="chart-retention">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-primary" />
            Recorded
          </span>
          <span className="flex items-center gap-2">
            <span className="w-5 border-t border-dashed border-accent" />
            Estimate
          </span>
        </div>
        <span className="font-mono-ui text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          Higher is better · {unit}
        </span>
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-[285px] w-full">
        <LineChart data={points} margin={{ top: 12, right: 10, left: -18, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border) / 0.6)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={24}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={42}
            tick={{ fontSize: 10 }}
            domain={[0, 'auto']}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) => label}
                formatter={(value, name) => (
                  <span className="font-mono-ui text-xs">
                    {name === 'actual' ? 'Recorded' : 'Estimated'} · {value} {unit}
                  </span>
                )}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="estimate"
            stroke="var(--color-estimate)"
            strokeWidth={2}
            strokeDasharray="5 6"
            dot={false}
            connectNulls
            isAnimationActive
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="var(--color-actual)"
            strokeWidth={3.5}
            dot={{ r: 4.5, fill: 'hsl(var(--card))', stroke: 'var(--color-actual)', strokeWidth: 2.5 }}
            activeDot={{ r: 6 }}
            connectNulls={false}
            isAnimationActive
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}