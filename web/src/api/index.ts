// AdminGateway HTTP 端点。列表使用服务端分页；写入不自动重试。
import { call } from './request';
import type {
  EntryKind,
  Entry,
  EntryInput,
  InfoSettings,
  Dashboard,
  DashboardQuery,
  SubscriptionLink,
  ClearResult,
  OrderCreate,
  OrderFilter,
  Health,
  MenuInput,
  NavMenu,
  NavRoute,
  AccessFilter,
  AuditClear,
  Account,
  AccountChange,
  AccountInput,
  AssignmentsInput,
  Audit,
  GrantsInput,
  Invite,
  InviteInput,
  List,
  LoginInput,
  MachineToken,
  Permit,
  NodeInput,
  GroupInput,
  GroupView,
  DeleteBatch,
  NodeView,
  Order,
  OrderAccess,
  OrderInput,
  PasswordInput,
  PermInput,
  Permission,
  Plan,
  PlanInput,
  PaymentConfig,
  PaymentInput,
  Principal,
  Role,
  RoleInput,
  Session,
  SettleInput,
  StateChange,
  Tutorial,
  TutorialInput,
  UserView,
  UserDevice,
  LinkRef,
  UserInput,
  DeleteInput,
} from './types';

export const listFilter = (query = '', state = '', kind = '', action = ''): AccessFilter => ({
  query: query.trim(), state: state || null, kind: kind || null, action: action || null,
});

export const api = {
  entries: (token: string, kind: EntryKind, offset: number, limit: number, query = '') =>
    call<List<Entry>>('GET', `/v1/${kind}`, { token, query: { offset, limit, query } }),
  entry: (token: string, kind: EntryKind, id: string) =>
    call<Entry>('GET', `/v1/${kind}/${id}`, { token }),
  saveEntry: (token: string, kind: EntryKind, input: EntryInput) =>
    call<Entry>('PUT', `/v1/${kind}`, { token, body: input }),
  deleteEntry: (token: string, kind: EntryKind, id: string, input: DeleteInput) =>
    call<null>('DELETE', `/v1/${kind}/${id}`, { token, body: input }),
  settings: (token: string) => call<InfoSettings>('GET', '/v1/information', { token }),
  saveSettings: (token: string, threshold: number) =>
    call<InfoSettings>('PUT', '/v1/information', { token, body: { version: 1, threshold } }),
  dashboard: (token: string, input: DashboardQuery) =>
    call<Dashboard>('POST', '/v1/dashboard/query', { token, body: input, quiet: true }),
  groups: (token: string, offset: number, limit: number) =>
    call<List<GroupView>>('GET', '/v1/groups', { token, query: { offset, limit } }),
  saveGroup: (token: string, input: GroupInput) =>
    call<GroupView>('POST', '/v1/groups', { token, body: input }),
  searchAccounts: (token: string, offset: number, limit: number, filter: AccessFilter) =>
    call<List<Account>>('POST', '/v1/accounts/query', { token, body: { version: 1, filter, offset, limit } }),
  searchRoles: (token: string, offset: number, limit: number, filter: AccessFilter) =>
    call<List<Role>>('POST', '/v1/roles/query', { token, body: { version: 1, filter, offset, limit } }),
  searchPerms: (token: string, offset: number, limit: number, filter: AccessFilter) =>
    call<List<Permission>>('POST', '/v1/permissions/query', { token, body: { version: 1, filter, offset, limit } }),
  searchAudits: (token: string, offset: number, limit: number, filter: AccessFilter) =>
    call<List<Audit>>('POST', '/v1/audits/query', { token, body: { version: 1, filter, offset, limit } }),
  clearAudits: (token: string, input: AuditClear) =>
    call<ClearResult>('DELETE', '/v1/audits', { token, body: input }),
  login: (input: LoginInput) => call<Session>('POST', '/v1/login', { body: input }),
  logout: (token: string) => call<null>('POST', '/v1/logout', { token }),
  me: (token: string) => call<Principal>('GET', '/v1/me', { token }),
  routes: (token: string) => call<NavRoute[]>('GET', '/v1/routes', { token }),
  menus: (token: string) => call<NavMenu[]>('GET', '/v1/menus', { token }),
  saveMenu: (token: string, input: MenuInput) =>
    call<NavMenu>('PUT', '/v1/menus', { token, body: input }),

  deleteOrder: (token: string, id: string, input: DeleteInput) => call<null>('DELETE', `/v1/orders/${id}`, { token, body: input }),
  searchUsers: (token: string, offset: number, limit: number, query = '') =>
    call<List<UserView>>('POST', '/v1/users/query', { token, body: { version: 1, query, offset, limit } }),
  searchOrders: (token: string, offset: number, limit: number, query = '', account: string | null = null, state: OrderFilter | null = null) =>
    call<List<Order>>('POST', '/v1/orders/query', { token, body: { version: 1, query, account, state, offset, limit } }),

  user: (token: string, id: string) => call<UserView>('GET', `/v1/users/${id}`, { token }),
  devices: (token: string, id: string, offset: number, limit: number, signal: AbortSignal) =>
    call<List<UserDevice>>('GET', `/v1/users/${id}/devices`, { token, query: { offset, limit }, signal, quiet: true }),
  deleteDevice: (token: string, id: string, input: DeleteInput & { device: string }) =>
    call<null>('DELETE', `/v1/users/${id}/devices`, { token, body: input, quiet: true }),
  createUser: (token: string, input: UserInput) =>
    call<UserView>('POST', '/v1/users', { token, body: input }),
  deleteUser: (token: string, id: string, input: DeleteInput) =>
    call<null>('DELETE', `/v1/users/${id}`, { token, body: input }),
  changeUser: (token: string, id: string, input: StateChange) =>
    call<UserView>('PATCH', `/v1/users/${id}`, { token, body: input }),

  userLinks: (token: string, id: string, signal: AbortSignal) =>
    call<LinkRef[]>('GET', `/v1/users/${id}/links`, { token, signal }),
  accessLink: (token: string, id: string, signal?: AbortSignal) => call<SubscriptionLink | null>('GET', `/v1/subscriptions/${id}/link`, { token, signal, quiet: true }),
  mintLink: (token: string, id: string) => call<SubscriptionLink>('POST', `/v1/subscriptions/${id}/link`, { token }),

  searchNodes: (token: string, offset: number, limit: number, query = '') =>
    call<List<NodeView>>('POST', '/v1/nodes/query', { token, body: { version: 1, query, offset, limit } }),
  deleteNodes: (token: string, input: DeleteBatch) =>
    call<null>('DELETE', '/v1/nodes/batch', { token, body: input }),
  searchPlans: (token: string, offset: number, limit: number, query = '') =>
    call<List<Plan>>('POST', '/v1/plans/query', { token, body: { version: 1, query, offset, limit } }),
  deletePlans: (token: string, input: DeleteBatch) =>
    call<null>('DELETE', '/v1/plans/batch', { token, body: input }),
  plan: (token: string, id: string) => call<Plan>('GET', `/v1/plans/${id}`, { token }),

  nodes: (token: string, offset: number, limit: number) =>
    call<List<NodeView>>('GET', '/v1/nodes', { token, query: { offset, limit } }),
  node: (token: string, id: string) => call<NodeView>('GET', `/v1/nodes/${id}`, { token }),
  health: (token: string, id: string, signal: AbortSignal) =>
    call<Health>('GET', `/v1/nodes/${id}/health`, { token, signal, quiet: true }),
  saveNode: (token: string, input: NodeInput) =>
    call<NodeView>('POST', '/v1/nodes', { token, body: input }),
  enroll: (token: string, ttl = 600, group: string | null = null) =>
    call<Permit>('POST', '/v1/nodes/enroll', { token, body: { version: 1, ttl, group } }),
  rotateNodeToken: (token: string, id: string) =>
    call<MachineToken>('POST', `/v1/nodes/${id}/token`, { token }),

  orders: (token: string, offset: number, limit: number) =>
    call<List<Order>>('GET', '/v1/orders', { token, query: { offset, limit } }),
  order: (token: string, id: string) => call<Order>('GET', `/v1/orders/${id}`, { token }),
  orderAccess: (token: string, id: string) => call<OrderAccess>('GET', `/v1/orders/${id}/access`, { token }),
  createOrder: (token: string, input: OrderCreate) => call<Order>('POST', '/v1/orders', { token, body: input }),
  saveOrder: (token: string, id: string, input: OrderInput) => call<OrderAccess>('PUT', `/v1/orders/${id}/access`, { token, body: input }),
  settleOrder: (token: string, id: string, input: SettleInput) =>
    call<Order>('POST', `/v1/orders/${id}/settle`, { token, body: input }),

  plans: (token: string, offset: number, limit: number) =>
    call<List<Plan>>('GET', '/v1/plans', { token, query: { offset, limit } }),
  savePlan: (token: string, input: PlanInput) =>
    call<Plan>('PUT', '/v1/plans', { token, body: input }),
  payments: (token: string, offset: number, limit: number) =>
    call<List<PaymentConfig>>('GET', '/v1/payments', { token, query: { offset, limit } }),
  savePayment: (token: string, input: PaymentInput) =>
    call<PaymentConfig>('PUT', '/v1/payments', { token, body: input }),

  tutorials: (token: string, offset: number, limit: number) =>
    call<List<Tutorial>>('GET', '/v1/tutorials', { token, query: { offset, limit } }),
  saveTutorial: (token: string, input: TutorialInput) =>
    call<Tutorial>('PUT', '/v1/tutorials', { token, body: input }),

  invite: (token: string, input: InviteInput) =>
    call<Invite>('POST', '/v1/invites', { token, body: input }),

  accounts: (token: string, offset: number, limit: number) =>
    call<List<Account>>('GET', '/v1/accounts', { token, query: { offset, limit } }),
  account: (token: string, id: string) => call<Account>('GET', `/v1/accounts/${id}`, { token }),
  createAccount: (token: string, input: AccountInput) =>
    call<Account>('POST', '/v1/accounts', { token, body: input }),
  changeAccount: (token: string, id: string, input: AccountChange) =>
    call<Account>('PATCH', `/v1/accounts/${id}`, { token, body: input }),
  deleteAccount: (token: string, id: string, input: DeleteInput) =>
    call<null>('DELETE', `/v1/accounts/${id}`, { token, body: input }),
  resetUser: (token: string, id: string, input: PasswordInput) =>
    call<null>('POST', `/v1/users/${id}/password`, { token, body: input }),
  resetPassword: (token: string, id: string, input: PasswordInput) =>
    call<null>('POST', `/v1/accounts/${id}/password`, { token, body: input }),
  assignments: (token: string, id: string) =>
    call<string[]>('GET', `/v1/accounts/${id}/roles`, { token }),
  assign: (token: string, id: string, input: AssignmentsInput) =>
    call<Account>('PUT', `/v1/accounts/${id}/roles`, { token, body: input }),

  roles: (token: string, offset: number, limit: number) =>
    call<List<Role>>('GET', '/v1/roles', { token, query: { offset, limit } }),
  role: (token: string, id: string) => call<Role>('GET', `/v1/roles/${id}`, { token }),
  saveRole: (token: string, input: RoleInput) =>
    call<Role>('PUT', '/v1/roles', { token, body: input }),
  grants: (token: string, id: string) =>
    call<string[]>('GET', `/v1/roles/${id}/permissions`, { token }),
  grant: (token: string, id: string, input: GrantsInput) =>
    call<Role>('PUT', `/v1/roles/${id}/permissions`, { token, body: input }),

  permissions: (token: string, offset: number, limit: number) =>
    call<List<Permission>>('GET', '/v1/permissions', { token, query: { offset, limit } }),
  savePerm: (token: string, input: PermInput) =>
    call<Permission>('PUT', '/v1/permissions', { token, body: input }),

  audits: (token: string, offset: number, limit: number) =>
    call<List<Audit>>('GET', '/v1/audits', { token, query: { offset, limit } }),
};
