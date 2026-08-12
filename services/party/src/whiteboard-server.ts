import type * as Party from "partykit/server";

const CURSOR_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
];

export default class WhiteboardServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  private userColors = new Map<string, string>();
  private userInfo = new Map<string, { name: string; id: string; avatar: string }>();
  private colorIndex = 0;

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const color = CURSOR_COLORS[this.colorIndex % CURSOR_COLORS.length];
    this.colorIndex++;
    this.userColors.set(conn.id, color);

    const elements = await this.room.storage.get("elements");
    const appState = await this.room.storage.get("appState");
    const files = await this.room.storage.get("files");

    if (elements) {
      conn.send(JSON.stringify({
        type: "scene-snapshot",
        elements,
        appState: appState || { viewBackgroundColor: "#ffffff" },
        files: files || {},
      }));
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    switch (data.type) {
      case "scene-init": {
        const existing = await this.room.storage.get("elements");
        if (!existing) {
          await this.room.storage.put("elements", data.elements);
          await this.room.storage.put("appState", data.appState);
          if (data.files) {
            await this.room.storage.put("files", data.files);
          }
        }
        const elements = await this.room.storage.get("elements");
        const appState = await this.room.storage.get("appState");
        const files = await this.room.storage.get("files");
        sender.send(JSON.stringify({
          type: "scene-snapshot",
          elements,
          appState: appState || { viewBackgroundColor: "#ffffff" },
          files: files || {},
        }));
        break;
      }

      case "scene-update": {
        const stored = ((await this.room.storage.get("elements")) || []) as any[];
        const elementMap = new Map(stored.map((el: any) => [el.id, el]));
        for (const el of data.elements) {
          const existing = elementMap.get(el.id);
          if (!existing || el.version >= existing.version) {
            elementMap.set(el.id, el);
          }
        }
        const merged = Array.from(elementMap.values());
        await this.room.storage.put("elements", merged);

        this.room.broadcast(
          JSON.stringify({
            type: "scene-update",
            elements: data.elements,
            source: sender.id,
          }),
          [sender.id]
        );
        break;
      }

      case "cursor-update": {
        if (data.user) {
          this.userInfo.set(sender.id, {
            name: data.user.name,
            id: data.user.id,
            avatar: data.user.avatar,
          });
        }
        this.room.broadcast(
          JSON.stringify({
            ...data,
            source: sender.id,
            user: {
              ...data.user,
              color: this.userColors.get(sender.id),
            },
          }),
          [sender.id]
        );
        break;
      }
    }
  }

  onClose(conn: Party.Connection) {
    this.userColors.delete(conn.id);
    this.userInfo.delete(conn.id);
    this.room.broadcast(
      JSON.stringify({
        type: "user-left",
        userId: conn.id,
      })
    );
  }
}

WhiteboardServer satisfies Party.Worker;
