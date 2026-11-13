import ts from 'typescript';
import type { Guard } from 'luna-router/core';

type Module = typeof import('../src/router/router');
const ids = new Map<string, number>();
export const menuId = (name: string): number => {
  if (!ids.has(name)) ids.set(name, ids.size + 1);
  return ids.get(name)!;
};
const source = await Bun.file(new URL('../src/router/router.ts', import.meta.url)).text();
const transpiler = new Bun.Transpiler({ loader: 'ts' });
// 在无 DOM 的单元测试中执行真实纯函数，不初始化浏览器历史或应用仓库。
const names = ['hasView', 'pagePath', 'joinPath', 'visibleMenu', 'buildRecords', 'pageTrail', 'createSync'] as const;
const script = transpiler.transformSync(source.slice(source.indexOf('export const hasView'), source.indexOf('\nconst resolve')))
  .replace(/\bexport /g, '');
export const views = Object.fromEntries(Array.from(new Bun.Glob('**/*.svelte').scanSync({
  cwd: new URL('../src/views/', import.meta.url).pathname,
})).map(file => [`../views/${file}`, async () => ({})]));
const helpers = new Function('views', `${script}\nreturn { ${names.join(', ')} };`)(views) as Pick<Module, typeof names[number]>;
export const { hasView, pagePath, joinPath, visibleMenu, buildRecords, pageTrail, createSync } = helpers;

const ast = ts.createSourceFile('router.ts', source, ts.ScriptTarget.Latest, true);
const statement = ast.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(ast) === 'router.beforeEach') as ts.ExpressionStatement;
const callback = (statement.expression as ts.CallExpression).arguments[0]!;
const guard = transpiler.transformSync(`export default ${callback.getText(ast)}`).replace('export default', 'return');
export const createGuard = (session: { restore: () => Promise<boolean>; authenticated: boolean }, navigation: {
  reset: () => void; loaded: boolean; load: () => Promise<void>; firstPath: string;
}): Guard => new Function('session', 'navigation', guard)(session, navigation);
