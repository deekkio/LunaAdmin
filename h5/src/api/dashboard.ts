export interface DashboardQuery {
  version: 1;
  start: number | null;
  end: number | null;
}

export interface Amount {
  currency: string;
  minor: string;
}

export interface Dashboard {
  recharge: Amount[] | null;
  online: number | null;
  /** 活跃节点中无新鲜健康样本的数量；停用节点单独统计。 */
  offline: number | null;
  users: number | null;
  nodes: number | null;
  disabled: number | null;
  orders: number | null;
  daily: DashboardDaily[] | null;
}

export interface DashboardDaily {
  /** UTC 当日起点的 Unix 秒。 */
  day: number;
  orders: number;
  revenue: Amount[];
}
