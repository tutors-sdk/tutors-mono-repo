/**
 * A client for the Digital Credentials Consortium signing service
 * (https://github.com/digitalcredentials/signing-service).
 *
 * The service signs whatever it is sent with the tenant's key and has no authentication of its
 * own, so this client runs on the server only and the service is never exposed publicly.
 */

import type { OpenBadgeCredential } from "./credential.ts";

export interface SigningConfig {
  /** The service's root, e.g. "http://signing:4006". */
  endpoint: string;
  /** The tenant whose key signs, set on the service as TENANT_SEED_<TENANT>. */
  tenant: string;
  /** Data Integrity suite; the service defaults to ed25519. */
  suite?: "eddsa2022" | "ed25519";
  fetch?: typeof fetch;
}

export interface SigningClient {
  sign(credential: OpenBadgeCredential): Promise<OpenBadgeCredential>;
}

export function createSigningClient(config: SigningConfig): SigningClient {
  const doFetch = config.fetch ?? fetch;
  const url = `${config.endpoint.replace(/\/+$/, "")}/instance/${encodeURIComponent(config.tenant)}/credentials/sign?suite=${config.suite ?? "eddsa2022"}`;
  return {
    async sign(credential) {
      const response = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential) });
      if (!response.ok) throw new Error(`Signing service refused credential ${credential.id}: HTTP ${response.status}`);
      const signed = (await response.json()) as OpenBadgeCredential;
      if (!signed.proof) throw new Error(`Signing service returned credential ${credential.id} without a proof`);
      return signed;
    }
  };
}
