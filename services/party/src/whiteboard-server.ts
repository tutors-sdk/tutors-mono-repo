import { Server, type Connection, type ConnectionContext } from "partyserver";

const CURSOR_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
];

export class WhiteboardServer extends Server {
  private userColors = new Map<string, string>();
  private userInfo = new Map<string, { name: string; id: string; avatar: string }>();
  private colorIndex = 0;

  async onConnect(conn: Connection, ctx: ConnectionContext) {
    const color = CURSOR_COLORS[this.colorIndex % CURSOR_COLORS.length];
    this.colorIndex++;
    this.userColors.set(conn.id, color);

    const elements = await this.ctx.storage.get("elements");
    const appState = await this.ctx.storage.get("appState");
    const files = await this.ctx.storage.get("files");

    if (elements) {
      conn.send(JSON.stringify({
        type: "scene-snapshot",
        elements,
        appState: appState || { viewBackgroundColor: "#ffffff" },
        files: files || {},
      }));
    }
  }

  async onMessage(conn: Connection, message: string | ArrayBuffer) {
    let data: any;
    try {
      data = JSON.parse(message as string);
    } catch {
      return;
    }

    switch (data.type) {
      case "scene-init": {
        const existing = await this.ctx.storage.get("elements");
        if (!existing) {
          await this.ctx.storage.put("elements", data.elements);
          await this.ctx.storage.put("appState", data.appState);
          if (data.files) {
            await this.ctx.storage.put("files", data.files);
          }
        }
        const elements = await this.ctx.storage.get("elements");
        const appState = await this.ctx.storage.get("appState");
        const files = await this.ctx.storage.get("files");
        conn.send(JSON.stringify({
          type: "scene-snapshot",
          elements,
          appState: appState || { viewBackgroundColor: "#ffffff" },
          files: files || {},
        }));
        break;
      }

      case "scene-update": {
        const stored = ((await this.ctx.storage.get("elements")) || []) as any[];
        const elementMap = new Map(stored.map((el: any) => [el.id, el]));
        for (const el of data.elements) {
          const existing = elementMap.get(el.id);
          if (!existing || el.version >= existing.version) {
            elementMap.set(el.id, el);
          }
        }
        const merged = Array.from(elementMap.values());
        await this.ctx.storage.put("elements", merged);

        this.broadcast(
          JSON.stringify({
            type: "scene-update",
            elements: data.elements,
            source: conn.id,
          }),
          [conn.id]
        );
        break;
      }

      case "cursor-update": {
        if (data.user) {
          this.userInfo.set(conn.id, {
            name: data.user.name,
            id: data.user.id,
            avatar: data.user.avatar,
          });
        }
        this.broadcast(
          JSON.stringify({
            ...data,
            source: conn.id,
            user: {
              ...data.user,
              color: this.userColors.get(conn.id),
            },
          }),
          [conn.id]
        );
        break;
      }
    }
  }

  onClose(conn: Connection, code: number, reason: string, wasClean: boolean) {
    this.userColors.delete(conn.id);
    this.userInfo.delete(conn.id);
    this.broadcast(
      JSON.stringify({
        type: "user-left",
        userId: conn.id,
      })
    );
  }
}
