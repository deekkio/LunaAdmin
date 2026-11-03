// AdminGateway /api/v1 契约。字段与 Rust api 包的 JSON 序列化保持一致。
export type Provider = 'alipay' | 'wechat';

export interface PaymentConfig {
  id: string;
  revision: number;
  name: string;
  provider: Provider;
  app_id: string;
  merchant_id: string | null;
  serial: string | null;
  public_id: string | null;
  notify_url: string;
  has_private: boolean;
  has_public: boolean;
  has_api: boolean;
  enabled: boolean;
  updated_at: number;
}

export interface PaymentInput {
  version: number;
  request: string;
  id: string;
  revision: number;
  name: string;
  provider: Provider;
  app_id: string;
  merchant_id: string | null;
  serial: string | null;
  public_id: string | null;
  notify_url: string;
  private_key: string | null;
  public_key: string | null;
  api_key: string | null;
  enabled: boolean;
}


export type Code =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid'
  | 'missing'
  | 'conflict'
  | 'quota'
  | 'rate_limited'
  | 'unavailable';

export interface Failure {
  code: Code;
}

export interface List<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface Session {
  account: string;
  token: string;
  expires_at: number;
}

export interface Principal {
  account: string;
  username: string;
  root: boolean;
  roles: string[];
  permissions: string[];
}

export interface Quota {
  limit_bytes: number;
  used_bytes: number;
  reserved_bytes: number;
  remaining_bytes: number;
}

export interface Profile {
  account: string;
  email: string;
  state: string;
  expires_at: number | null;
  quota: Quota | null;
}

export interface UserView {
  profile: Profile;
  group: { id: string; name: string };
}

export interface UserInput {
  version: number;
  request: string;
  email: string;
  password: string;
  state: 'active' | 'disabled';
}

export interface DeleteInput {
  version: number;
  request: string;
}

export type KeyState = 'active' | 'revoked';

export interface NodeKey {
  key: string;
  public: string;
  until: number;
  state: KeyState;
}

export interface NodeTrust {
  until: number;
  keys: NodeKey[];
}

export interface NodeConfig {
  node: string;
  name: string;
  endpoints: string[];
  trust: NodeTrust;
}

export type Suite = 'aes-256-gcm' | 'chacha20-poly1305';

export interface Sample {
  version: number;
  node: string;
  boot: string;
  sequence: number;
  measured_at: number;
  latency_ms: number | null;
  healthy: boolean;
  cpu_millis: number;
  memory_bytes: number;
  capacity: number;
  connections: number;
  upload_bytes: number;
  download_bytes: number;
}

export interface GroupView {
  id: string;
  name: string;
  users: number;
  nodes: number;
}

export interface GroupInput {
  version: number;
  request: string;
  name: string;
}

export interface NodeView {
  id: string;
  group: string;
  node: NodeConfig;
  suite: Suite;
  enabled: boolean;
  sample: Sample | null;
  stale: boolean;
}

export type OrderState = 'pending' | 'paid' | 'cancelled';

export interface Order {
  username?: string;
  id: string;
  account: string;
  plan: string;
  name: string;
  state: OrderState;
  price_minor: number;
  currency: string;
  duration_days: number;
  quota_bytes: number;
  nodes: string[];
  created_at: number;
  paid_at: number | null;
  subscription: string | null;
  payment_ref: string | null;
}

export interface Plan {
  id: string;
  name: string;
  price_minor: number;
  currency: string;
  duration_days: number;
  quota_bytes: number;
  nodes: string[];
  enabled: boolean;
}

export interface Tutorial {
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
  updated_at: number;
}

export interface InviteView {
  id: string;
  uses: number;
  remaining: number;
  expires_at: number;
  created_at: number;
}

export interface Invite {
  invite: InviteView;
  code: string;
}

export interface Permit {
  token: string;
  expires_at: number;
}

export interface MachineToken {
  token: string;
  expires_at: number;
}

export interface Account {
  id: string;
  username: string;
  state: string;
  roles: string[];
  root: boolean;
  created_at: number;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  system: boolean;
  permissions: string[];
}

export interface Permission {
  code: string;
  name: string;
  enabled: boolean;
  system: boolean;
}

export interface Audit {
  id: number;
  actor: string;
  username: string;
  action: string;
  target: string;
  request: string | null;
  created_at: number;
}

export const API_VERSION = 1;

export interface LoginInput {
  version: number;
  username: string;
  password: string;
}

export interface DeleteBatch {
  version: number;
  request: string;
  ids: string[];
}

export interface NodeInput {
  id: string | null;
  group: string;
  version: number;
  request: string;
  node: NodeConfig;
  suite: Suite;
  enabled: boolean;
}

export interface PlanInput {
  version: number;
  request: string;
  id: string;
  name: string;
  price_minor: number;
  currency: string;
  duration_days: number;
  quota_bytes: number;
  nodes: string[];
  enabled: boolean;
}

export interface TutorialInput {
  version: number;
  request: string;
  id: string;
  slug: string;
  title: string;
  body: string;
  published: boolean;
}

export interface InviteInput {
  version: number;
  request: string;
  uses: number;
  expires_at: number;
}

export interface StateChange {
  version: number;
  state?: 'active' | 'disabled';
  group?: string;
  password?: string;
}

export interface Tunnel {
  ipv4: string;
  dns_ipv4: string;
}

export interface SettleInput {
  version: number;
  request: string;
  payment_ref: string;
  price_minor: number;
  currency: string;
  tunnel: Tunnel | null;
}

export interface AccountInput {
  version: number;
  request: string;
  username: string;
  password: string;
}

export interface AccountChange {
  version: number;
  request: string;
  state: 'active' | 'disabled';
  roles?: string[];
  password?: string;
}

export interface PasswordInput {
  version: number;
  request: string;
  password: string;
}

export interface RoleInput {
  version: number;
  request: string;
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  permissions?: string[];
}

export interface PermInput {
  version: number;
  request: string;
  code: string;
  name: string;
  enabled: boolean;
}

export interface AssignmentsInput {
  version: number;
  request: string;
  roles: string[];
}

export interface GrantsInput {
  version: number;
  request: string;
  permissions: string[];
}

/** 动态导航路由：由 /v1/routes 按当前账号权限过滤后返回。 */
export interface NavRoute {
  code: string;
  title: string;
  path: string;
  view: string | null;
  icon: string | null;
  rank: number;
  children: NavRoute[];
}

/** 菜单管理记录（/v1/menus）。 */
export interface NavMenu {
  id: string;
  parent_id: string | null;
  code: string;
  title: string;
  path: string;
  view: string | null;
  icon: string | null;
  rank: number;
  enabled: boolean;
  perm: string | null;
  children: NavMenu[];
}

export interface MenuInput {
  version: number;
  request: string;
  id: string;
  parent_id: string | null;
  code: string;
  title: string;
  path: string;
  view: string | null;
  icon: string | null;
  rank: number;
  enabled: boolean;
  perm: string | null;
}

export interface SubscriptionLink { url: string; expires_at: number }

export type LinkKind = 'subscription' | 'dedicated';
export interface LinkRef {
  id: string;
  kind: LinkKind;
}

export interface AccessFilter {
  query: string;
  state: string | null;
  kind: string | null;
  action: string | null;
}

export interface AuditClear {
  version: number;
  request: string;
  filter: AccessFilter;
}


export interface OrderAccess {
  order: string;
  account: string;
  plan: string;
  name: string;
  state: 'active' | 'disabled';
  quota_bytes: number;
  used_bytes: number;
  expires_at: number;
  revision: number;
}
export interface OrderInput {
  version: number;
  request: string;
  revision: number;
  plan: string;
  state: 'active' | 'disabled';
  quota_bytes: number;
  expires_at: number;
}
