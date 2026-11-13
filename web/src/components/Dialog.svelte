<script lang="ts">
  import { Dialog } from '@luna/components';
  import type { DialogProps } from '@luna/components/contracts';

  let {
    open = $bindable(false),
    height = 640,
    panelStyle,
    bodyStyle,
    footerStyle,
    ...rest
  }: DialogProps & { height?: number } = $props();

  // 在请求返回前预留完整窗口，超出的内容沿用组件库的正文滚动。
  const panel = $derived(`${panelStyle ?? ''}; height: ${height}px;`);
  const body = $derived(`${bodyStyle ?? ''}; flex: 1 1 0;`);
  const footer = $derived(`${footerStyle ?? ''}; flex: 0 0 auto;`);
</script>

<Dialog {...rest} bind:open panelStyle={panel} bodyStyle={body} footerStyle={footer} />
