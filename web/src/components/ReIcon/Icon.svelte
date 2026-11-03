<script lang="ts">
  import type { IconProps } from '@luna/components/contracts';
  import { Icon as LunaIcon } from '@luna/components';
  import { menuIcon } from './offline';

  let {
    name,
    group = false,
    ...rest
  }: Omit<IconProps, 'icon'> & {
    name?: string | null;
    group?: boolean;
  } = $props();
</script>

<LunaIcon icon={menuIcon(name, group)} {...rest} />
