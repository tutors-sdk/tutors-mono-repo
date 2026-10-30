// Stands in for Vento under Vitest: initTemplateEngine registers filters and plugins on the
// environment, and every template renders to an empty page.
export default function vento() {
  return {
    filters: {} as Record<string, unknown>,
    use: () => {},
    load: async () => ({ content: "" }),
    run: async () => ({ content: "" })
  };
}

export function autoTrim() {
  return {};
}
