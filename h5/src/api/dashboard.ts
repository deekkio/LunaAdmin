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
  offline: number | null;
  users: number | null;
}
