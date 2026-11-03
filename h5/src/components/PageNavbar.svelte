<script lang="ts">
  import { Navbar } from '@luna/components/h5';
  import type { Snippet } from 'svelte';
  import { useRoute } from 'luna-router';
  import { router } from '../router';
  import { navigation } from '../stores/navigation';
  import { homePath } from '../layouts/home';
  import { mobilePage } from '../layouts/mobile';

  interface Props {
    title: string;
    back?: boolean;
    rightText?: string;
    right?: Snippet;
    onright?: () => void;
  }

  let { title, back, rightText = '', right, onright }: Props = $props();
  const route = useRoute();
  const page = $derived(
    mobilePage(
      route.path,
      homePath(navigation.menu),
      route.meta.parent,
      navigation.menu,
    ),
  );
</script>

<Navbar
  {title}
  fixed
  placeholder
  back={back ?? !page.root}
  onback={() => void router.replace(page.parent)}
  {rightText}
  {right}
  {onright}
/>
