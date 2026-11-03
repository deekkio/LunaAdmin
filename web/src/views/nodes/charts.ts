import { init, use, type ECharts, type ComposeOption } from 'echarts/core';
import { LineChart, type LineSeriesOption } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, type GridComponentOption, type LegendComponentOption, type TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { format } from 'date-fns';
import type { Sample } from '../../api/types';
import { formatMetric, healthSeries, type HealthKind } from './health';

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

export interface ChartInput { kind: HealthKind; samples: readonly Sample[]; height: number }
export interface ChartHandle { update(input: ChartInput): void; dispose(): void }
type ChartOption = ComposeOption<LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption>;

export const mountChart = (host: HTMLDivElement, initial: ChartInput): ChartHandle => {
  let engine: ECharts | undefined;
  let input = initial;
  let width = 0;
  let height = 0;
  const paint = (): void => {
    if (!host.isConnected || host.clientWidth <= 0) return;
    width = host.clientWidth;
    if (!engine) engine = init(host, undefined, { renderer: 'svg', width, height: input.height });
    else if (height !== input.height) engine.resize({ width, height: input.height, animation: { duration: 0 } });
    height = input.height;
    const compact = width < 240;
    const left = compact ? 58 : 64;
    const top = compact ? 8 : 28;
    const style = getComputedStyle(host);
    const token = (key: string, fallback: string): string => style.getPropertyValue(key).trim() || fallback;
    const text = token('--ln-text-2', '#606266');
    const border = token('--ln-border-1', '#ebeef5');
    const colors = [token('--ln-primary', '#165dff'), input.kind === 'connections' ? token('--ln-text-3', '#86909c') : token('--ln-success', '#23c343')];
    const lines = healthSeries(input.samples, input.kind);
    const end = (input.samples.at(-1)?.measured_at ?? Date.now() / 1000) * 1000;
    const start = (input.samples.at(0)?.measured_at ?? end / 1000 - 30) * 1000;
    const option: ChartOption = {
      animation: false,
      color: colors,
      textStyle: { color: text, fontFamily: style.fontFamily },
      grid: { left, right: 8, top, bottom: 22, outerBoundsMode: 'none' },
      legend: { show: lines.length > 1 && !compact, top: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: text, fontSize: 10 } },
      tooltip: {
        trigger: 'axis', renderMode: 'richText',
        backgroundColor: token('--ln-bg-1', '#fff'), borderColor: border, textStyle: { color: text },
        valueFormatter: value => formatMetric(typeof value === 'number' ? value : null, input.kind),
      },
      xAxis: {
        type: 'time', min: start - 5000, max: end + 5000, splitNumber: compact ? 2 : 3,
        axisLabel: { color: text, fontSize: compact ? 9 : 10, hideOverlap: true, showMinLabel: !compact, align: compact ? 'right' : 'center', alignMinLabel: 'left', alignMaxLabel: 'right', formatter: (value: number) => format(value, 'HH:mm:ss') },
        axisLine: { lineStyle: { color: border } }, axisTick: { show: false },
      },
      yAxis: {
        type: 'value', min: 0, max: input.kind === 'cpu' ? 100 : undefined,
        minInterval: input.kind === 'connections' ? 1 : undefined, splitNumber: compact ? 2 : 3,
        axisLabel: { color: text, fontSize: compact ? 9 : 10, width: compact ? 50 : 56, overflow: 'truncate', formatter: (value: number) => formatMetric(value, input.kind) },
        splitLine: { lineStyle: { color: border, type: 'dashed' } },
      },
      series: lines.map((line, index) => ({
        id: line.name, name: line.name, type: 'line', data: line.values,
        smooth: true, smoothMonotone: 'x', connectNulls: false, showSymbol: true, symbolSize: 4,
        lineStyle: { width: 2, type: input.kind === 'connections' && index === 1 ? 'dashed' : 'solid' },
        emphasis: { disabled: true },
      })),
    };
    engine.setOption(option, { notMerge: true, silent: true });
  };
  const resize = new ResizeObserver(() => {
    if (host.clientWidth === width) return;
    engine?.resize({ width: host.clientWidth, height: input.height, animation: { duration: 0 } });
    paint();
  });
  const theme = new MutationObserver(paint);
  resize.observe(host);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ln-theme'] });
  paint();
  return {
    update(next) { input = next; paint(); },
    dispose() { resize.disconnect(); theme.disconnect(); engine?.dispose(); },
  };
};
