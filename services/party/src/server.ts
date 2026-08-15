import { Server, type Connection, type ConnectionContext, routePartykitRequest } from "partyserver";

export class MainServer extends Server {
  onConnect(conn: Connection, ctx: ConnectionContext) {
    console.log(
      `Tutors connection: id: ${conn.id} room: ${this.name} url: ${
        new URL(ctx.request.url).pathname
      }`
    );
  }

  onMessage(conn: Connection, message: string | ArrayBuffer) {
    console.log(`connection ${conn.id} sent message: ${message}`);
    this.broadcast(message);
  }
}

export { WhiteboardServer } from "./whiteboard-server";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
