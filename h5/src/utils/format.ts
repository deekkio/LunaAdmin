// 展示格式化：金额使用最小货币单位，流量使用字节，日期按本地时区呈现与输入。
import { addDays, addYears, format, fromUnixTime as fromUnix, getUnixTime as toUnix, isValid, parse } from 'date-fns';
import type { Quota } from '../api/types';

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

export const formatBytes = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '-';
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < BYTE_UNITS.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${BYTE_UNITS[unit]}`;
};

export const formatMoney = (minor: number | null | undefined, currency: string): string => {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '-';
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

export const formatTime = (seconds: number | null | undefined): string => {
  if (!seconds) return '-';
  const date = fromUnix(seconds);
  return isValid(date) ? format(date, 'yyyy-MM-dd HH:mm:ss') : '-';
};

/** 本地日期时间解析为 Unix 秒，拒绝无效日期与时钟跳变中不存在的时间。 */
export const parseTime = (value: string): number | null => {
  const input = value.trim();
  for (const pattern of [INPUT_FORMAT, "yyyy-MM-dd'T'HH:mm"]) {
    const date = parse(input, pattern, new Date());
    if (isValid(date) && format(date, pattern) === input) return toUnix(date);
  }
  return null;
};

export const timeInput = (seconds: number | null | undefined): string => {
  if (!seconds) return '';
  const date = fromUnix(seconds);
  return isValid(date) ? format(date, INPUT_FORMAT) : '';
};

/** 默认到期时间：当前时刻加指定天数，以本地日期时间填入。 */
export const futureInput = (days: number): string => {
  return format(addDays(new Date(), days), INPUT_FORMAT);
};

export const yearInput = (years: number): string => format(addYears(new Date(), years), INPUT_FORMAT);

export const formatTraffic = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '-';
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value / 1_000_000_000)} GB`;
};

export const formatQuota = (quota: Quota | null | undefined): string => {
  if (!quota) return '-';
  return `${formatTraffic(quota.used_bytes)} / ${formatTraffic(quota.limit_bytes)}`;
};

const ID_PATTERN = /^[0-9a-f]{32}$/;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export const isId = (value: string): boolean => {
  return ID_PATTERN.test(value);
};

export const isPublicKey = (value: string): boolean => {
  return PUBLIC_KEY_PATTERN.test(value);
};

export const isIpv4 = (value: string): boolean => {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};

export const isEndpoint = (value: string): boolean => {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return false;
  const port = Number(value.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return false;
  const host = value.slice(0, separator);
  if (host.startsWith('[')) {
    return host.endsWith(']') && host.length > 2;
  }
  return isIpv4(host);
};

export const stateText = (state: string): string => {
  return state === 'active' ? '已启用' : state === 'disabled' ? '已禁用' : state;
};

export const orderStateText = (state: string): string => {
  switch (state) {
    case 'pending':
      return '待支付';
    case 'paid':
      return '已支付';
    case 'cancelled':
      return '已取消';
    default:
      return state;
  }
};

/** 保留完整标识；显示省略由组件按实际可用宽度处理。 */
export const formatId = (value: unknown): string => value === null || value === undefined || value === '' ? '-' : String(value);

const actions: Readonly<Record<string, string>> = {
  'audit:clear': '清理日志',
  'admin:bootstrap': '初始化管理员', 'admin:login': '管理员登录', 'admin:logout': '管理员退出',
  'user:group': '迁移用户分组', 'user:create': '新增用户', 'user:change': '更新用户', 'user:delete': '删除用户', 'user:reset_password': '重置用户密码',
  'access:create_account': '新增管理员', 'access:change_account': '更新管理员', 'access:reset_password': '重置管理员密码',
  'access:save_role': '保存角色', 'access:save_perm': '保存权限', 'access:assign': '分配角色', 'access:grant': '分配权限', 'access:read': '查看权限',
  'group:create': '新建节点分组',
  'node:permit': '生成节点部署授权', 'node:enroll': '注册节点', 'node:save': '保存节点', 'node:delete': '删除节点', 'node:machine': '签发节点凭据',
  'plan:save': '保存套餐', 'plan:delete': '删除套餐', 'document:save': '保存文档', 'invite:create': '生成邀请码',
  'subscription:link': '生成订阅链接',
  'order:settle': '确认收款', 'order:paid': '订单支付', 'payment:close': '关闭支付', 'menu:save': '保存路由菜单',
};

export const actionText = (value: string): string => actions[value] ?? '其他操作';
