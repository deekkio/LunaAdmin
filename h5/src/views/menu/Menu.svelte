<script lang="ts">
  import { Icon } from '@luna/components';
  import { Empty, Grid, Text } from '@luna/components/h5';
  import { useRouter } from 'luna-router';
  import PageNavbar from '../../components/PageNavbar.svelte';
  import { navigation } from '../../stores/navigation';
  import { menuIcon } from '../../layouts/icons';
  import { homeLinks } from '../../layouts/home';

  const router = useRouter();
  const links = $derived(homeLinks(navigation.menu));
  const tones = ['primary', 'success', 'warning', 'danger', 'info', 'primary', 'success', 'warning'];
  const tone = (index: number): string => tones[index % tones.length];
</script>

<PageNavbar title="服务中心" />
{#if links.length}
  <Grid min={84} gap={14}>
    {#each links as link, index (link.path)}
      <button class="tile" onclick={() => void router.push(link.path)} aria-label={link.label}>
        <span class={`tile-icon ${tone(index)}`} aria-hidden="true">
          <Icon icon={menuIcon(link.icon)} size={22} />
        </span>
        <Text size="small" class="tile-label">{link.label}</Text>
      </button>
    {/each}
  </Grid>
{:else}
  <Empty imageSize={72} description="当前账号暂无可用的管理页面" />
{/if}

<style>
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 6px;
    border: none;
    border-radius: 14px;
    background: var(--ln-bg-1, #fff);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .tile:active {
    transform: scale(0.97);
  }
  .tile-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 13px;
  }
  .tile-icon.primary { background: color-mix(in srgb, var(--ln-primary, #165dff) 12%, transparent); color: var(--ln-primary, #165dff); }
  .tile-icon.success { background: color-mix(in srgb, var(--ln-success, #23c343) 12%, transparent); color: var(--ln-success, #23c343); }
  .tile-icon.warning { background: color-mix(in srgb, var(--ln-warning, #e6a23c) 14%, transparent); color: var(--ln-warning, #e6a23c); }
  .tile-icon.danger { background: color-mix(in srgb, var(--ln-danger, #f56c6c) 12%, transparent); color: var(--ln-danger, #f56c6c); }
  .tile-icon.info { background: color-mix(in srgb, var(--ln-info, #909399) 12%, transparent); color: var(--ln-info, #909399); }
  .tile :global(.tile-label) {
    color: var(--ln-text-1, #303133);
    white-space: nowrap;
  }
</style>
