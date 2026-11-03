// 服务端分页列表状态。加载失败由 call() 统一弹出 Message，这里只清空数据。
import type { List, Result } from '../api/types';

/** 可选页大小；网关 limit 上限为 100。 */
export const PAGE_SIZES: readonly number[] = [10, 20, 50, 100];

export class Pager<T> {
  items = $state.raw<T[]>([]);
  total = $state(0);
  page = $state(1);
  pageSize = $state(10);
  loading = $state(false);
  loaded = $state(false);

  #load: (offset: number, limit: number) => Promise<Result<List<T>>>;
  #seq = 0;

  constructor(load: (offset: number, limit: number) => Promise<Result<List<T>>>) {
    this.#load = load;
  }

  refresh = async (): Promise<void> => {
    const seq = ++this.#seq;
    this.loading = true;
    try {
      const result = await this.#load((this.page - 1) * this.pageSize, this.pageSize);
      if (seq !== this.#seq) return;
      const list = result.code ? null : result.data;
      this.items = list?.items ?? [];
      this.total = list?.total ?? 0;
      this.loaded = true;
      const pages = Math.max(1, Math.ceil(this.total / this.pageSize));
      if (this.page > pages) {
        this.page = pages;
        await this.refresh();
      }
    } finally {
      if (seq === this.#seq) this.loading = false;
    }
  };

  goto = (page: number): void => {
    if (page === this.page) return;
    this.page = page;
    void this.refresh();
  };

  /** 更换页大小后回到第一页重新加载。 */
  resize = (size: number): void => {
    const next = PAGE_SIZES.includes(size) ? size : 10;
    if (next === this.pageSize) return;
    this.pageSize = next;
    this.page = 1;
    void this.refresh();
  };
}
