import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// LunaUI 组件的样式写在 <style lang="scss"> 中，必须经过预处理器编译。
export default {
  preprocess: vitePreprocess({
    style: true,
    script: false
  })
};
