<script lang="ts">
  import { Tag } from '@luna/components';
  let { root }: { root: boolean } = $props();
</script>

<Tag tone={root ? 'warning' : 'info'}>{root ? '超级管理员' : '普通管理员'}</Tag>
