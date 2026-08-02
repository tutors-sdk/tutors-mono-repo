import { MockSupabaseClient } from "./mocks";

export class ExtendedMockSupabaseClient extends MockSupabaseClient {
  private rpcHandlers: Map<string, (params: Record<string, unknown>) => unknown> = new Map();

  registerRpc(name: string, handler: (params: Record<string, unknown>) => unknown): void {
    this.rpcHandlers.set(name, handler);
  }

  async rpc(name: string, params: Record<string, unknown> = {}): Promise<{ data: unknown; error: null }> {
    const handler = this.rpcHandlers.get(name);
    if (handler) {
      return { data: handler(params), error: null };
    }
    return { data: null, error: null };
  }
}

export class MockAuthSession {
  private sessions: Map<string, { userId: string; provider: string; expiresAt: number }> = new Map();
  private authenticated = false;

  async signIn(provider: string, credentials: { id: string; name: string }): Promise<{ userId: string; error: null }> {
    const session = { userId: credentials.id, provider, expiresAt: Date.now() + 3600000 };
    this.sessions.set(credentials.id, session);
    this.authenticated = true;
    return { userId: credentials.id, error: null };
  }

  async signOut(): Promise<void> {
    this.sessions.clear();
    this.authenticated = false;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  getSession(userId: string): { userId: string; provider: string; expiresAt: number } | undefined {
    return this.sessions.get(userId);
  }

  simulateExpiry(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.expiresAt = Date.now() - 1000;
    }
  }
}

export class MockI18nProvider {
  private currentLocale = "en";
  private messages: Map<string, Record<string, string>> = new Map();

  constructor() {
    this.messages.set("en", { "nav.search": "Search", "error.fallback": "Something went wrong" });
    this.messages.set("de", { "nav.search": "Suche", "error.fallback": "Etwas ist schiefgelaufen" });
    this.messages.set("fr", { "nav.search": "Rechercher", "error.fallback": "Quelque chose s'est mal passé" });
    this.messages.set("es", { "nav.search": "Buscar", "error.fallback": "Algo salió mal" });
    this.messages.set("it", { "nav.search": "Cerca", "error.fallback": "Qualcosa è andato storto" });
  }

  setLocale(locale: string): void {
    this.currentLocale = locale;
  }

  getLocale(): string {
    return this.currentLocale;
  }

  t(key: string): string {
    const localeMessages = this.messages.get(this.currentLocale);
    if (localeMessages && key in localeMessages) {
      return localeMessages[key];
    }
    const fallback = this.messages.get("en");
    if (fallback && key in fallback) {
      return fallback[key];
    }
    return key;
  }

  addMessages(locale: string, messages: Record<string, string>): void {
    const existing = this.messages.get(locale) || {};
    this.messages.set(locale, { ...existing, ...messages });
  }
}
