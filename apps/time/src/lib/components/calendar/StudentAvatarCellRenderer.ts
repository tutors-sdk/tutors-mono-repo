import type { ICellRendererComp, ICellRendererParams } from "ag-grid-community";
import type { ConnectUserFieldsRow } from "$lib/connectUserFieldsRow";
import { mount, unmount } from "svelte";
import StudentAvatar from "$lib/components/StudentAvatar.svelte";

const GRID_AVATAR_SIZE = "size-8";
const GRID_AVATAR_INITIAL = "text-xs";

/**
 * AG Grid cell renderer that mounts {@link StudentAvatar} when the row has a student.
 */
export class StudentAvatarCellRenderer implements ICellRendererComp<ConnectUserFieldsRow> {
  private eGui!: HTMLDivElement;
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

    const studentId = params.data?.studentid?.trim();
    if (!studentId) return;

    const fullName = String(params.data?.full_name ?? "").trim() || studentId;
    const avatarUrl = params.data?.avatar_url;

    this.instance = mount(StudentAvatar, {
      target: this.eGui,
      props: {
        fullName,
        avatarUrl: avatarUrl && String(avatarUrl).trim() !== "" ? avatarUrl : null,
        size: GRID_AVATAR_SIZE,
        initialClass: GRID_AVATAR_INITIAL
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
