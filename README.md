# LunaAdmin

Luna 的管理员 Web 控制台。包含两个独立项目,均使用 Bun、Vite、TypeScript、Svelte 5,界面组件与样式来自本地 LunaUI,路由使用 LunaRouter:

- `web/` — PC 控制台(开发地址 `http://localhost:5181`)
- `h5/` — 移动端控制台(开发地址 `http://localhost:5182`)

```sh
cd web && bun install && bun run dev
cd h5 && bun install && bun run dev
```

目录结构遵循 Vue 项目风格:

```
src/
  api/        request 客户端与按域拆分的端点、API 契约类型
  components/ 可复用业务组件（如 PageNavbar、Subscriptions、UserDialog）；内容卡片与分页使用 LunaUI Card、Pagination
  layouts/    布局(PC 为 AdminLayout:Menu + 头部)
  router/     路由表、全局守卫与权限映射
  stores/     会话与分页状态(Svelte 5 runes)
  styles/     全局样式
  utils/      格式化与校验工具
  views/      按模块分目录的页面(dashboard/、login/、nodes/、users/、orders/、plans/、tutorials/、invites/、access/、error/)
```

依赖指向同级目录下的 `../../APP/LunaUI/packages/components`、`../../APP/LunaUI/packages/theme-chalk` 与 `../../APP/LunaRouter`,消费其已有 `dist` 包导出;首次使用前需要这些本地库已完成构建。两点配置是必需的:`svelte.config.js` 必须启用 `vitePreprocess`(LunaUI 组件样式写在 `<style lang="scss">` 中);`vite.config.ts` 中的 sass 兜底 importer 用于解析组件 dist 内按源码层级编写的 `@use` 相对路径。

```sh
bun run check   # svelte-check + tsc
bun run test    # bun test test/
bun run build   # 产物在各自 dist/
```

## 网关

两个项目都只请求同源 `/api/v1/*`。开发代理把 `/api` 前缀移除后转发到 AdminGateway;`http://127.0.0.1:8081` 是开发约定,实际网关监听地址由其配置文件指定。可覆盖代理目标:

```sh
GATEWAY_URL=http://127.0.0.1:8081 bun run dev
```

本地服务拓扑(浏览器只访问网关的 HTTP 端口,mTLS RPC 端口由服务间内部使用,前端不接触):

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| Admin | 127.0.0.1:9443 | mTLS RPC,仅网关内部调用 |
| AdminGateway | http://127.0.0.1:8081 | 管理端 HTTP 入口,`/api` 代理目标 |
| User | 127.0.0.1:9444 | mTLS RPC,仅网关内部调用 |
| UserGateway | http://127.0.0.1:8080 | 用户端 HTTP 入口(管理控制台不使用) |

`GATEWAY_URL` 只由 Vite 服务端读取,不注入浏览器包。生产部署必须提供等价的同源反向代理,例如:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8081/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

这样 `/api/v1/me` 到达上游时是 `/v1/me`。前端无需访问内部 Admin RPC 或 Consul,也不需要网关内部调用凭据。路由采用 LunaRouter Hash History,静态托管无需回退规则。

## 功能与会话

- 默认分组代码分别为 `workbench`、`user_center`、`service_center`、`configuration`、`system`，分类由 `group` 字段决定。菜单将分组标题与一级业务目录分开：工作台 → 仪表盘，用户中心 → 用户管理，服务中心 → 节点管理，综合配置 → 支付管理、公告管理，系统管理 → 系统管理。菜单数据由 Admin 统一下发；部署时需运行 Admin 完整迁移链至 `202611120004_navigation.sql`，并同步 Admin、AdminGateway 与 PC/H5 静态资源。现有页面路径、权限、启用状态及自定义菜单继续保留。
- 后台所有 Dialog 统一使用各端的 `components/Dialog.svelte`，打开时即按场景预留高度，加载、成功、空态和失败态保持同一窗口尺寸；正文在窗口内滚动，短视口沿用组件库最大高度限制。尺寸不依赖请求结果，宽度、标题、按钮、圆角与配色继续使用 LunaUI 原有样式。
- PC 管理员登录后先读取 `/me` 验证身份，再恢复动态路由菜单。`localStorage["user"]` 统一保存 `{token, expires_at, navigation, sidebar}`；其中 `navigation` 为 `{version: 5, account, routes}`；`routes` 是含完整 `children` 的菜单树，包含数据库生成的正整数 `id`、`code/title/path/view/icon/rank/group/hidden`，与仓库中的规范化树一致，不存组件函数或展开后的路由记录。同账号有效缓存可直接恢复侧栏和动态路由；无缓存或菜单管理保存后的强制更新才请求 `GET /v1/routes`。成功更新替换缓存（空树也有效），暂时更新失败保留已有树；退出和 401 清除所属 `user` 会话及其缓存，身份或权限变化仅清理该会话下的导航与侧栏缓存及动态路由。侧栏按 `children` 递归渲染，`group` 仅显示分组标题，`hidden` 不显示但保留获授权的访问入口；空目录不显示，未知视图使用 404，目录跳转到首个可用子项。`view` 直接指定相对 `views` 目录且不带 `.svelte` 后缀的组件路径（如 `nodes/List`），由 `import.meta.glob` 自动发现，不回退静态业务菜单；实际接口权限始终由服务端校验。PC 菜单管理通过 `GET/PUT /v1/menus` 查看和维护菜单树；新建时 `id: null`，数据库自动分配编号，编辑使用原数字 ID，上级菜单 `parent_id` 为数字或 null，请求 `request` 继续使用独立幂等标识，H5 提供树形只读查看。
- API 层与网关共用统一响应信封 `{code, message, data}`:服务端成功 `code` 为 `ok`(`操作成功`)并取 `data`,`call()` 对视图归一为 `code: ''`;失败时 `data` 为 null,提示文案优先使用服务端返回的 `message`(缺失时回退到本地码表映射)。失败自动弹出反馈(web 用 LunaUI Message,h5 用 Toast),视图层只判断 `code`,成功操作另有 Message/Toast 成功提示。登录字段为 `username`(不再使用邮箱)。
- 动态菜单的 `icon` 使用系统 Lucide 图标映射,未配置或不支持的名称显示目录/页面默认图标;PC 菜单配置提供图标建议与预览。PC 侧栏按当前账户在 `user.sidebar` 保存 `{account, keys}` 展开状态,动态菜单恢复后展开当前页面的父目录,并剔除已移除或无权访问的目录。
- 仪表盘按账号读权限展示节点、用户、订单的真实总数及菜单快捷入口。节点列表、详情、采样指标、结构化配置编辑和监测 token 轮换;PC/H5 用户列表的新增、状态编辑和详情使用 Dialog,详情含配额与订阅。删除需要确认,采用软删除并撤销登录与连接授权,保留订单、订阅及审计记录。节点订阅和用户订阅页面从现有用户响应读取订阅,按用户分页;节点 ID 筛选只作用于当前页,查看关联需要 `user:read`。
- 订单详情与人工到账结算,要求支付流水、实际金额、货币和显式确认;首次开通可输入隧道 IPv4 与 DNS IPv4。
- 套餐、教程、邀请码生成,以及管理员账户、角色、权限和审计页面。列表使用服务端分页,默认每页 10 条;PC 可选 10、20、50、100 条,H5 每页 10 条。
- 会话 token 持久化在 localStorage(`user`,含过期时间):刷新后自动恢复并重新读取 `/me` 重建身份;token 过期或 `/me` 返回未认证时清除存储并回到登录页,路由守卫等待身份及动态菜单恢复后重新匹配完整地址,保留 query/hash,避免分组路径被详情参数路由抢先匹配。token 不写入 URL 或日志。401 清除会话,403 保留登录状态。会话、导航和侧栏写入合并最新的 `user` 内容，保留其他字段；同 token 续期保留缓存，切换 token 创建新对象；退出立即清除所属本地会话，缓存读写和清理前会核对当前存储的 token，忽略已失去归属的操作。
- 请求默认超时 15 秒,写入不会自动重试。需要幂等的表单使用无连字符的随机请求标识;相同内容失败重试保留标识,成功或修改内容后更换。
- 邀请码与节点监测 token 仅在生成响应后临时展示;离开页面或关闭信息后无法再找回。

网关目前不提供邀请码历史列表、删除套餐/教程或编辑用户配额接口,因此页面只呈现现有契约支持的操作。采样指标来自节点的真实上报,无数据时明确提示。日期表单标记为 UTC;金额使用最小货币单位,流量使用字节。

用户新增与删除需要配套更新 AdminGateway、Admin,并先应用 `202610250001_users.sql` 迁移;前端不会代为执行数据库迁移。

浏览器冒烟验证需要运行中的 AdminGateway 与已配置的管理员账户;单元测试使用受控 HTTP 响应验证请求客户端行为,不包含真实凭据。页面冒烟也可用拦截响应验证,不会向真实网关写入菜单或业务数据。
