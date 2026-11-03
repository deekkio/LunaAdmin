import type { Guard } from 'luna-router';
import type { Principal } from '../api/types';
import type { Result } from '../api/request';

interface SessionState {
  authenticated: boolean;
  token: string | null;
  principal: Principal | null;
  setPrincipal: (principal: Principal) => void;
}

interface NavState {
  loaded: boolean;
  firstPath: string;
  load: () => Promise<void>;
  reset: () => void;
}

/** 首次深链必须在服务端路由安装后重新匹配，随后才加载业务组件。 */
export const createGuard = (
  session: SessionState,
  navigation: NavState,
  read: (token: string) => Promise<Result<Principal>>,
): Guard => async (to) => {
  const login = { path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
  if (!session.authenticated) {
    navigation.reset();
    return to.meta.public ? undefined : login;
  }
  if (!session.principal) {
    const token = session.token!;
    const result = await read(token);
    if (session.token !== token || result.code || !result.data) {
      return to.meta.public ? undefined : login;
    }
    session.setPrincipal(result.data);
  }
  if (!navigation.loaded) {
    await navigation.load();
    if (!session.authenticated) return login;
    return to.redirectedFrom?.path === '/'
      ? { path: '/', query: to.query, hash: to.hash }
      : to.fullPath;
  }
  if (to.meta.public && to.path === '/login') return navigation.firstPath;
};
