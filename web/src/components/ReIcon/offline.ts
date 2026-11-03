import type { Component } from 'svelte';
import CreditCard from '@lucide/svelte/icons/credit-card';
import BookOpen from '@lucide/svelte/icons/book-open';
import FileText from '@lucide/svelte/icons/file-text';
import Folder from '@lucide/svelte/icons/folder';
import KeyRound from '@lucide/svelte/icons/key-round';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import ListTree from '@lucide/svelte/icons/list-tree';
import Network from '@lucide/svelte/icons/network';
import Package from '@lucide/svelte/icons/package';
import Rss from '@lucide/svelte/icons/rss';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import Shield from '@lucide/svelte/icons/shield';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import Ticket from '@lucide/svelte/icons/ticket';
import UserCog from '@lucide/svelte/icons/user-cog';
import Users from '@lucide/svelte/icons/users';

type Glyph = Component<{ size?: number | string }>;

// 本地图标注册表：服务端返回名称，侧栏与页面使用同一套解析和回退规则。
const icons = new Map<string, Glyph>([
  ['credit-card', CreditCard],
  ['book-open', BookOpen],
  ['file-text', FileText],
  ['folder', Folder],
  ['key-round', KeyRound],
  ['layout-dashboard', LayoutDashboard],
  ['list-tree', ListTree],
  ['network', Network],
  ['package', Package],
  ['rss', Rss],
  ['scroll-text', ScrollText],
  ['shield', Shield],
  ['shield-check', ShieldCheck],
  ['shopping-cart', ShoppingCart],
  ['ticket', Ticket],
  ['user-cog', UserCog],
  ['users', Users],
]);

export const iconNames: readonly string[] = [...icons.keys()];

export const menuIcon = (name?: string | null, group = false): Glyph => {
  return (
    icons.get(name?.trim().toLowerCase() ?? '') ?? (group ? Folder : FileText)
  );
};
