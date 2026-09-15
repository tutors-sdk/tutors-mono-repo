import type { ICellRendererComp, ICellRendererParams } from "ag-grid-community";
import type { ConnectUserFieldsRow } from "$lib/connectUserFieldsRow";
import { mount, unmount } from "svelte";
import SentimentIcon, { SENTIMENT_ICONS, type Sentiment } from "$lib/components/SentimentIcon.svelte";

/** Icon size tuned for dense calendar grids (24px). */
const GRID_SENTIMENT_ICON_SIZE = "size-6";

function parseSentiment(raw: unknown): Sentiment | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return s in SENTIMENT_ICONS ? (s as Sentiment) : null;
}

/**
 * AG Grid cell renderer that mounts {@link SentimentIcon} for valid `row.sentiment` values.
 */
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

    this.instance = mount(SentimentIcon, {
      target: this.eGui,
      props: {
        sentiment,
        size: GRID_SENTIMENT_ICON_SIZE,
        label: `Sentiment: ${sentiment}`
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
