import type { ICellRendererComp, ICellRendererParams } from "ag-grid-community";
import type { ConnectUserFieldsRow } from "$lib/connectUserFieldsRow";
import { mount, unmount } from "svelte";
import { t } from "@tutors/i18n";
import Icon from "@tutors/ui-primitives/components/Icon.svelte";

const SENTIMENTS = ["neutral", "fine", "delighted", "confident", "overwhelmed", "confused", "drained"];

function parseSentiment(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return SENTIMENTS.includes(s) ? s : null;
}

export class SentimentCellRenderer implements ICellRendererComp<ConnectUserFieldsRow> {
  private eGui!: HTMLDivElement;
  /** Return value of `mount()` — required for `unmount()`. */
  private instance: Record<string, unknown> | null = null;

  init(params: ICellRendererParams<ConnectUserFieldsRow, string>): void {
    this.eGui = document.createElement("div");
    this.eGui.className = "flex items-center justify-center h-full min-h-[32px] py-0.5";
    this.render(params);
  }

  private render(params: ICellRendererParams<ConnectUserFieldsRow, string>): void {
    if (this.instance) {
      unmount(this.instance);
      this.instance = null;
    }
    this.eGui.replaceChildren();

    const sentiment = parseSentiment(params.data?.sentiment);
    if (!sentiment) return;

    this.instance = mount(Icon, {
      target: this.eGui,
      props: {
        type: sentiment,
        height: "24",
        tip: `${t("content.sentimentLabel")}: ${sentiment}`
      }
    }) as Record<string, unknown>;
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(params: ICellRendererParams<ConnectUserFieldsRow, string>): boolean {
    this.render(params);
    return true;
  }

  destroy(): void {
    if (this.instance) {
      unmount(this.instance);
      this.instance = null;
    }
  }
}
