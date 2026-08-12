declare module "markdown-it" {
  class MarkdownIt {
    constructor(options?: any);
    use(plugin: any, ...params: any[]): this;
    render(src: string, env?: any): string;
    renderInline(src: string, env?: any): string;
    renderer: { rules: Record<string, any> };
    block: { ruler: { before(name: string, id: string, rule: any): void } };
    inline: { ruler: { before(name: string, id: string, rule: any): void } };
  }
  export default MarkdownIt;
}
declare module "markdown-it-anchor";
declare module "markdown-it-deflist";
declare module "markdown-it-emoji";
declare module "markdown-it-footnote";
declare module "markdown-it-mark";
declare module "markdown-it-sub";
declare module "markdown-it-sup";
declare module "markdown-it-table-of-contents";
