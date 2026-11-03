<script lang="ts">
  import { Card, CellGroup, Empty, Grid, Row, Text } from '@luna/components/h5';
  import { useRouter } from 'luna-router';
  import type { NavRoute } from '../../api/types';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { navigation } from '../../stores/navigation';
  import { menuIcon } from '../../layouts/icons';
  import { homeLinks } from '../../layouts/home';

  const router = useRouter();
  const links = $derived(homeLinks(navigation.menu));
</script>

{#snippet branch(items: readonly NavRoute[], depth: number)}
  {#each items as item (item.code)}
    {@const link = homeLinks([item]).find((link) => link.path === item.path)}
    {#if link}
      <Card aria-label={item.title}>
        <CellGroup items={[{ key: link.path, title: link.label, icon: menuIcon(link.icon), arrow: true, clickable: true }]}
          onselect={(entry) => void router.push(entry.key)} />
      </Card>
    {/if}
    {#if item.children.length}
      <Grid min={280} gap={12}>
        <Row><Text tag="div" role="heading" aria-level={Math.min(depth, 6)} size="large">{item.title}</Text></Row>
        {@render branch(item.children, depth + 1)}
      </Grid>
    {/if}
  {/each}
{/snippet}

<PageNavbar title="服务中心" />
<Grid min={280} gap={16}>
  {#if links.length}
    {@render branch(navigation.menu, 2)}
  {:else}
    <Empty imageSize={72} description="当前账号暂无可用的管理页面" />
  {/if}
</Grid>
