type QueryFilter = { column: string; op: string; value: unknown };

export class MockSupabaseClient {
  private tables: Map<string, unknown[]> = new Map();

  setTableData(table: string, data: unknown[]): void {
    this.tables.set(table, data);
  }

  from(table: string) {
    const data = this.tables.get(table) || [];
    return new MockQueryBuilder(data);
  }
}

class MockQueryBuilder {
  private data: unknown[];
  private filters: QueryFilter[] = [];
  private orderColumn: string | null = null;
  private orderAsc: boolean = true;
  private limitCount: number | null = null;
  private isSingle: boolean = false;

  constructor(data: unknown[]) {
    this.data = [...data];
  }

  select(_columns?: string) {
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

  async then(resolve: (value: { data: unknown; error: null }) => void) {
    let result = this.data;

    for (const filter of this.filters) {
      result = result.filter((row: any) => {
        switch (filter.op) {
          case "eq": return row[filter.column] === filter.value;
          case "neq": return row[filter.column] !== filter.value;
          case "gte": return row[filter.column] >= filter.value;
          case "lte": return row[filter.column] <= filter.value;
          default: return true;
        }
      });
    }

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

    const data = this.isSingle ? (result[0] || null) : result;
    resolve({ data, error: null });
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
    const event = new CloseEvent("close");
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
