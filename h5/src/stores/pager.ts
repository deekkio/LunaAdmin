// 服务端分页列表状态，默认每页 10 条。加载失败由 call() 统一弹出 Message，这里只清空数据。
import { fromStore, writable } from 'svelte/store';
import type { Result } from '../api/request';
import type { List } from '../api/types';

export const PAGE_SIZES: readonly number[] = [10, 20, 50, 100];

export class Pager<T> {
  #items = fromStore(writable<T[]>([]));
  #total = fromStore(writable<number>(0));
  #page = fromStore(writable<number>(1));
  #pageSize = fromStore(writable<number>(10));
  #loading = fromStore(writable<boolean>(false));
  #loaded = fromStore(writable<boolean>(false));
  #failed = fromStore(writable<boolean>(false));

  #load: (offset: number, limit: number) => Promise<Result<List<T>>>;
  #seq = 0;

  constructor(load: (offset: number, limit: number) => Promise<Result<List<T>>>) {
    this.#load = load;
  }

  get items(): T[] {
    return this.#items.current;
  }

  set items(value: T[]) {
    this.#items.current = value;
  }

  get total(): number {
    return this.#total.current;
  }

  set total(value: number) {
    this.#total.current = value;
  }

  get page(): number {
    return this.#page.current;
  }

  set page(value: number) {
    this.#page.current = value;
  }

  get pageSize(): number { return this.#pageSize.current; }

  resize = (size: number): void => {
    const next = PAGE_SIZES.includes(size) ? size : 10;
    if (next === this.pageSize) return;
    this.#pageSize.current = next;
    this.page = 1;
    void this.refresh();
  };

  get loading(): boolean {
    return this.#loading.current;
  }

  set loading(value: boolean) {
    this.#loading.current = value;
  }

  get loaded(): boolean {
    return this.#loaded.current;
  }

  set loaded(value: boolean) {
    this.#loaded.current = value;
  }

  get failed(): boolean {
    return this.#failed.current;
  }

  refresh = async (): Promise<void> => {
    const seq = ++this.#seq;
    this.loading = true;
    this.#failed.current = false;
    try {
      const result = await this.#load((this.page - 1) * this.pageSize, this.pageSize);
      if (seq !== this.#seq) return;
      const list = result.code ? null : result.data;
      this.#failed.current = Boolean(result.code);
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
}
