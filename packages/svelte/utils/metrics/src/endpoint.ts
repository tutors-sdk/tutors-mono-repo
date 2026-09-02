import { metricsRegistry } from "./metrics.ts";

export async function metricsEndpoint(): Promise<Response> {
  const metrics = await metricsRegistry.metrics();
  return new Response(metrics, {
    headers: { "Content-Type": metricsRegistry.contentType }
  });
}
