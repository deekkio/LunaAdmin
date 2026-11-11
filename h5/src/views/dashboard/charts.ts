// 仪表盘图表：环形（节点状态）与卡片迷你趋势线，主题令牌随重绘读取。
// 每次 render 重建宿主内的渲染槽，规避 echarts 重复初始化冲突。
import { init, use, type ECharts, type ComposeOption } from 'echarts/core';
import { LineChart, PieChart, type LineSeriesOption, type PieSeriesOption } from 'echarts/charts';
import { TooltipComponent, type TooltipComponentOption } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([PieChart, LineChart, TooltipComponent, SVGRenderer]);

type ChartOption = ComposeOption<LineSeriesOption | PieSeriesOption | TooltipComponentOption>;

export type ChartTokens = (key: string, fallback: string) => string;
type OptionBuilder = (tokens: ChartTokens) => ChartOption;

export interface ChartHandle {
  /** 以新的数据与配置重绘；宿主未就绪时等待下一帧。 */
  render(build: OptionBuilder): void;
  dispose(): void;
}

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
