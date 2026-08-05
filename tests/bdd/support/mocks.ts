type QueryFilter = { column: string; op: string; value: unknown };

export class MockSupabaseClient {
  private tables: Map<string, unknown[]> = new Map();
  private tableErrors: Map<string, object> = new Map();

  setTableData(table: string, data: unknown[]): void {
    this.tables.set(table, data);
  }

  getTableData(table: string): unknown[] {
    return this.tables.get(table) || [];
  }

  setTableError(table: string, error: object): void {
    this.tableErrors.set(table, error);
  }

  clearTableError(table: string): void {
    this.tableErrors.delete(table);
  }

  clearAllErrors(): void {
    this.tableErrors.clear();
  }

  from(table: string) {
    const error = this.tableErrors.get(table);
    if (error) {
      return new MockQueryBuilder([], null, error);
    }
    const data = this.tables.get(table) || [];
    return new MockQueryBuilder(data, this.tables, null, table);
  }
}

class MockQueryBuilder {
  private data: unknown[];
  private backingStore: Map<string, unknown[]> | null;
  private tableName: string | null;
  private filters: QueryFilter[] = [];
  private orderColumn: string | null = null;
  private orderAsc: boolean = true;
  private limitCount: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private isDelete: boolean = false;
  private isHead: boolean = false;
  private pendingUpdate: Record<string, unknown> | null = null;
  private injectedError: object | null;

  constructor(
    data: unknown[],
    backingStore: Map<string, unknown[]> | null,
    injectedError: object | null,
    tableName?: string
  ) {
    this.data = [...data];
    this.backingStore = backingStore;
    this.injectedError = injectedError;
    this.tableName = tableName ?? null;
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.head) {
      this.isHead = true;
    }
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "neq", value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: "gte", value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: "lte", value });
    return this;
  }

  in(column: string, values: unknown[]) {
    if (this.isDelete) {
      if (this.injectedError) {
        return this._resolvePromise({ error: this.injectedError });
      }
      this._applyDelete(column, values);
      return this._resolvePromise({ error: null });
    }
    this.filters.push({ column, op: "in", value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  update(fields: Record<string, unknown>) {
    this.pendingUpdate = fields;
    return this;
  }

  upsert(row: Record<string, unknown>, options?: { onConflict?: string }) {
    if (this.injectedError) {
      return this._resolvePromise({ error: this.injectedError });
    }
    if (this.backingStore && this.tableName) {
      const tableData = this.backingStore.get(this.tableName) || [];
      const conflictKey = options?.onConflict;
      if (conflictKey) {
        const existingIndex = tableData.findIndex(
          (r: any) => r[conflictKey] === row[conflictKey]
        );
        if (existingIndex >= 0) {
          tableData[existingIndex] = { ...tableData[existingIndex] as object, ...row };
        } else {
          tableData.push(row);
        }
      } else {
        tableData.push(row);
      }
      this.backingStore.set(this.tableName, tableData);
    }
    return this._resolvePromise({ error: null });
  }

  private _applyFilter(data: unknown[]): unknown[] {
    let result = data;
    for (const filter of this.filters) {
      result = result.filter((row: any) => {
        switch (filter.op) {
          case "eq": return row[filter.column] === filter.value;
          case "neq": return row[filter.column] !== filter.value;
          case "gte": return row[filter.column] >= filter.value;
          case "lte": return row[filter.column] <= filter.value;
          case "in": return (filter.value as unknown[]).includes(row[filter.column]);
          default: return true;
        }
      });
    }
    return result;
  }

  private _applyDelete(column: string, values: unknown[]): void {
    if (this.backingStore && this.tableName) {
      const tableData = this.backingStore.get(this.tableName) || [];
      const remaining = tableData.filter(
        (row: any) => !values.includes(row[column])
      );
      this.backingStore.set(this.tableName, remaining);
    }
  }

  private _resolvePromise(value: any): PromiseLike<any> {
    return {
      then: (resolve: (v: any) => void) => resolve(value),
    } as PromiseLike<any>;
  }

  async then(resolve: (value: any) => void) {
    if (this.injectedError) {
      resolve({ data: null, error: this.injectedError });
      return;
    }

    if (this.pendingUpdate && this.backingStore && this.tableName) {
      const tableData = this.backingStore.get(this.tableName) || [];
      const matching = this._applyFilter(tableData);
      for (const match of matching) {
        Object.assign(match as object, this.pendingUpdate);
      }
      resolve({ data: matching, error: null });
      return;
    }

    let result = this._applyFilter(this.data);

    if (this.orderColumn) {
      const col = this.orderColumn;
      const asc = this.orderAsc;
      result.sort((a: any, b: any) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }

    if (this.isHead) {
      resolve({ count: result.length, error: null });
      return;
    }

    if (this.isSingle) {
      if (result.length === 0) {
        resolve({ data: null, error: { code: "PGRST116", message: "Row not found" } });
      } else {
        resolve({ data: result[0], error: null });
      }
      return;
    }

    if (this.isMaybeSingle) {
      resolve({ data: result[0] || null, error: null });
      return;
    }

    resolve({ data: result, error: null });
  }
}

type MessageHandler = (event: MessageEvent) => void;
type CloseHandler = (event: CloseEvent) => void;

export class MockPartySocket {
  readyState: number = WebSocket.OPEN;
  private messageHandlers: MessageHandler[] = [];
  private closeHandlers: CloseHandler[] = [];

  addEventListener(type: string, handler: MessageHandler | CloseHandler): void {
    if (type === "message") {
      this.messageHandlers.push(handler as MessageHandler);
    } else if (type === "close") {
      this.closeHandlers.push(handler as CloseHandler);
    }
  }

  removeEventListener(type: string, handler: MessageHandler | CloseHandler): void {
    if (type === "message") {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    } else if (type === "close") {
      this.closeHandlers = this.closeHandlers.filter(h => h !== handler);
    }
  }

  simulateMessage(data: unknown): void {
    const event = new MessageEvent("message", { data: JSON.stringify(data) });
    this.messageHandlers.forEach(h => h(event));
  }

  simulateClose(): void {
    this.readyState = WebSocket.CLOSED;
    const CloseEventCtor = typeof CloseEvent !== "undefined"
      ? CloseEvent
      : (class extends Event { code = 1000; reason = ""; wasClean = true; }) as typeof CloseEvent;
    const event = new CloseEventCtor("close");
    this.closeHandlers.forEach(h => h(event));
  }

  send(_data: string | ArrayBuffer): void {}
  close(): void {
    this.simulateClose();
  }
}

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

export function createMockFetch(handlers: Record<string, FetchHandler | object>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        if (typeof handler === "function") {
          return handler(url, init);
        }
        return new Response(JSON.stringify(handler), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  };
}
