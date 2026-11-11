// 仪表盘图表：环形（节点状态）、柱状（下单趋势）、折线（在线率模拟）与卡片迷你趋势线。
// 主题令牌在每次重绘时读取，跟随深浅模式与窗口尺寸变化。
import { init, use, type ECharts, type ComposeOption } from 'echarts/core';
import {
  BarChart,
  LineChart,
  PieChart,
  type BarSeriesOption,
  type LineSeriesOption,
  type PieSeriesOption,
} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([PieChart, BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

type ChartOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | PieSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>;

export type ChartTokens = (key: string, fallback: string) => string;
type OptionBuilder = (tokens: ChartTokens) => ChartOption;

export interface ChartHandle {
  /** 以新的数据与配置重绘；宿主未就绪时等待下一帧。 */
  render(build: OptionBuilder): void;
  dispose(): void;
}

/**
 * 挂载一只随尺寸与主题重绘的 SVG 图表。每次 render 都重建宿主内的渲染槽，
 * 规避 echarts 在同一容器上重复初始化的冲突；实例与槽一起废弃。
 */
export const mountChart = (host: HTMLDivElement, height: number): ChartHandle => {
  let raf = 0;
  let pending: OptionBuilder | null = null;
  const tokens: ChartTokens = (key, fallback) => getComputedStyle(host).getPropertyValue(key).trim() || fallback;
  const paint = (): void => {
    if (!host.isConnected || host.clientWidth <= 0 || !pending) {
      // 首帧可能先于 {#if} 块插入文档，等下一帧再试一次。
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
      return;
    }
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const slot = document.createElement('div');
    slot.style.cssText = `width:100%;height:${height}px`;
    host.replaceChildren(slot);
    const engine = init(slot, undefined, { renderer: 'svg', width: host.clientWidth, height });
    engine.setOption(pending(tokens), { notMerge: true, silent: true });
  };
  const resize = new ResizeObserver(() => paint());
  const theme = new MutationObserver(() => paint());
  resize.observe(host);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ln-theme'] });
  return {
    render(build) {
      pending = build;
      paint();
    },
    dispose() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      resize.disconnect();
      theme.disconnect();
      host.replaceChildren();
      pending = null;
    },
  };
};

const baseText = (tokens: ChartTokens) => ({
  color: tokens('--ln-text-2', '#606266'),
  fontFamily: tokens('--ln-font-family', 'inherit'),
});

/** 节点状态环形图；图例由页面自行渲染以便展示数量与占比。 */
export const donutOption = (tokens: ChartTokens, values: { name: string; value: number; color: string }[]): ChartOption => ({
  tooltip: { trigger: 'item', renderMode: 'richText' },
  series: [
    {
      type: 'pie',
      radius: ['58%', '86%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: tokens('--ln-bg-1', '#fff') },
      data: values.map(({ name, value, color }) => ({
        name,
        value,
        itemStyle: { color: tokens(`--ln-${color}`, '#165dff') },
      })),
    },
  ],
});

/** 按日下单量柱状图。 */
export const barsOption = (tokens: ChartTokens, points: { label: string; value: number }[]): ChartOption => {
  const text = baseText(tokens);
  const border = tokens('--ln-border-1', '#ebeef5');
  const primary = tokens('--ln-primary', '#165dff');
  return {
    animation: false,
    grid: { left: 40, right: 8, top: 16, bottom: 24 },
    tooltip: {
      trigger: 'axis', renderMode: 'richText',
      backgroundColor: tokens('--ln-bg-1', '#fff'), borderColor: border, textStyle: { color: text.color },
    },
    xAxis: {
      type: 'category', data: points.map(({ label }) => label),
      axisLabel: { color: text.color, fontSize: 10, interval: Math.max(0, Math.ceil(points.length / 8) - 1) },
      axisLine: { lineStyle: { color: border } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', minInterval: 1, splitNumber: 3,
      axisLabel: { color: text.color, fontSize: 10 },
      splitLine: { lineStyle: { color: border, type: 'dashed' } },
    },
    series: [{
      type: 'bar', data: points.map(({ value }) => value),
      barMaxWidth: 22, itemStyle: { color: primary, borderRadius: [4, 4, 0, 0] },
    }],
  };
};

/** 折线图（在线率等百分比序列，0-100）。 */
export const lineOption = (tokens: ChartTokens, points: { label: string; value: number }[]): ChartOption => {
  const text = baseText(tokens);
  const border = tokens('--ln-border-1', '#ebeef5');
  const primary = tokens('--ln-primary', '#165dff');
  return {
    animation: false,
    grid: { left: 40, right: 12, top: 16, bottom: 24 },
    tooltip: {
      trigger: 'axis', renderMode: 'richText',
      backgroundColor: tokens('--ln-bg-1', '#fff'), borderColor: border, textStyle: { color: text.color },
      valueFormatter: (value) => `${value}%`,
    },
    xAxis: {
      type: 'category', data: points.map(({ label }) => label), boundaryGap: false,
      axisLabel: { color: text.color, fontSize: 10 },
      axisLine: { lineStyle: { color: border } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', min: 0, max: 100, splitNumber: 3,
      axisLabel: { color: text.color, fontSize: 10, formatter: '{value}%' },
      splitLine: { lineStyle: { color: border, type: 'dashed' } },
    },
    series: [{
      type: 'line', data: points.map(({ value }) => value),
      smooth: true, showSymbol: true, symbolSize: 5,
      lineStyle: { width: 2, color: primary },
      itemStyle: { color: primary },
      areaStyle: { color: primary, opacity: 0.08 },
    }],
  };
};

/** 统计卡片内的迷你趋势线，无坐标轴。 */
export const sparkOption = (tokens: ChartTokens, values: number[], tone: string): ChartOption => {
  const color = tokens(`--ln-${tone}`, '#165dff');
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: 'category', show: false, data: values.map((_, index) => String(index)) },
    yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
    series: [{
      type: 'line', data: values,
      smooth: true, showSymbol: false, connectNulls: true,
      lineStyle: { width: 2, color },
      areaStyle: { color, opacity: 0.12 },
    }],
  };
};
