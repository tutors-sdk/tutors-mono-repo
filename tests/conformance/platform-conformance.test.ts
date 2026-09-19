import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  configCompletenessFindings,
  dotenvKeys,
  envVarsRead,
  frozenClockFindings,
  k8sEnvKeys,
  manifestPolicyFindings,
  overlayDirs,
  parseImage,
  repoConfigCompletenessFindings,
  repoFrozenClockFindings
} from "../../scripts/checks/conformance.ts";
import { entryPointPolicyFindings, renderKustomization, variantDirs } from "../../scripts/checks/conformance.ts";
import { REPO_ROOT, readText, toPosix } from "../../scripts/checks/lib/repo.ts";

type Obj = Record<string, unknown>;

/** A Deployment that passes every policy; negative fixtures break one thing each. */
function compliantDeployment(): Obj {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "reader" },
    spec: {
      template: {
        spec: {
          automountServiceAccountToken: false,
          securityContext: { runAsNonRoot: true, seccompProfile: { type: "RuntimeDefault" } },
          volumes: [{ name: "tmp", emptyDir: {} }],
          containers: [
            {
              name: "app",
              image: "quay.io/tutors-sdk/tutors-reader:16.2.0",
              resources: { requests: { cpu: "100m", memory: "192Mi" }, limits: { memory: "384Mi" } },
              livenessProbe: { httpGet: { path: "/healthz/live", port: "http" } },
              readinessProbe: { httpGet: { path: "/healthz", port: "http" } },
              securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
            }
          ]
        }
      }
    }
  };
}

function breakIt(mutate: (pod: Obj, container: Obj) => void): Obj {
  const doc = compliantDeployment();
  const pod = ((doc.spec as Obj).template as Obj).spec as Obj;
  mutate(pod, (pod.containers as Obj[])[0]);
  return doc;
}

describe("platform conformance (runway tier J)", () => {
  describe("manifest policies", () => {
    it("accept a compliant workload and ignore non-workload kinds", () => {
      expect(manifestPolicyFindings([compliantDeployment(), { kind: "ConfigMap", data: {} }], { expectedTag: "16.2.0" })).toEqual([]);
    });

    it.each<[string, (pod: Obj, container: Obj) => void]>([
      ["unpinned-image: Deployment/reader/app: quay.io/tutors-sdk/tutors-reader:latest", (_, c) => (c.image = "quay.io/tutors-sdk/tutors-reader:latest")],
      ["unpinned-image: Deployment/reader/app: quay.io/tutors-sdk/tutors-reader", (_, c) => (c.image = "quay.io/tutors-sdk/tutors-reader")],
      ["unqualified-image: Deployment/reader/app: tutors/reader:16.2.0", (_, c) => (c.image = "tutors/reader:16.2.0")],
      ["unqualified-image: Deployment/reader/app: tutors-app:16.2.0", (_, c) => (c.image = "tutors-app:16.2.0")],
      [
        "quay-nested-repository: Deployment/reader/app: quay.io/tutors-sdk/tutors/reader:16.2.0",
        (_, c) => (c.image = "quay.io/tutors-sdk/tutors/reader:16.2.0")
      ],
      [
        "image-tag-not-release: Deployment/reader/app: quay.io/tutors-sdk/tutors-reader:16.1.0 (expected tag 16.2.0)",
        (_, c) => (c.image = "quay.io/tutors-sdk/tutors-reader:16.1.0")
      ],
      ["missing-requests: Deployment/reader/app", (_, c) => delete ((c.resources as Obj).requests as Obj).cpu],
      ["missing-memory-limit: Deployment/reader/app", (_, c) => delete (c.resources as Obj).limits],
      ["missing-liveness-probe: Deployment/reader/app", (_, c) => delete c.livenessProbe],
      ["missing-readiness-probe: Deployment/reader/app", (_, c) => delete c.readinessProbe],
      ["privilege-escalation-allowed: Deployment/reader/app", (_, c) => delete (c.securityContext as Obj).allowPrivilegeEscalation],
      ["writable-root-filesystem: Deployment/reader/app", (_, c) => ((c.securityContext as Obj).readOnlyRootFilesystem = false)],
      ["capabilities-not-dropped: Deployment/reader/app", (_, c) => ((c.securityContext as Obj).capabilities = { drop: ["NET_RAW"] })],
      ["may-run-as-root: Deployment/reader/app", (pod) => delete (pod.securityContext as Obj).runAsNonRoot],
      ["fixed-run-as-user: Deployment/reader/app: 0", (_, c) => ((c.securityContext as Obj).runAsUser = 0)],
      ["missing-seccomp-profile: Deployment/reader/app", (pod) => delete (pod.securityContext as Obj).seccompProfile],
      ["host-namespace: Deployment/reader: hostNetwork", (pod) => (pod.hostNetwork = true)],
      ["host-path-volume: Deployment/reader: docker", (pod) => (pod.volumes as Obj[]).push({ name: "docker", hostPath: { path: "/var/run" } })],
      ["service-account-token-mounted: Deployment/reader", (pod) => delete pod.automountServiceAccountToken]
    ])("negative fixture: %s", (expected, mutate) => {
      expect(manifestPolicyFindings([breakIt(mutate)], { expectedTag: "16.2.0" })).toContain(expected);
    });

    it("accepts a digest-pinned image regardless of tag", () => {
      const doc = breakIt((_, c) => (c.image = "quay.io/tutors-sdk/tutors-reader@sha256:abc"));
      expect(manifestPolicyFindings([doc], { expectedTag: "16.2.0" })).toEqual([]);
      expect(parseImage("localhost:5000/tutors/reader:1.0.0")).toEqual({ repository: "localhost:5000/tutors/reader", tag: "1.0.0", digest: undefined });
    });

    it("accepts other registries' nested paths and registries with a port", () => {
      for (const image of ["ghcr.io/tutors-sdk/tutors/reader:16.2.0", "localhost:5000/tutors/reader:16.2.0"]) {
        expect(manifestPolicyFindings([breakIt((_, c) => (c.image = image))], { expectedTag: "16.2.0" })).toEqual([]);
      }
    });

    it("every overlay names its app's Quay repository", () => {
      const names = overlayDirs().map((dir) => {
        const kustomization = yaml.load(readText(join(dir, "kustomization.yaml"))) as { images?: { newName?: string }[] };
        return kustomization.images?.map((image) => image.newName);
      });
      expect(names).toEqual(overlayDirs().map((dir) => [`quay.io/tutors-sdk/tutors-${toPosix(dir).split("/").pop()}`]));
    });

    it("every overlay pins its image to the release version in package.json", () => {
      const version = JSON.parse(readText(join(REPO_ROOT, "package.json"))).version;
      const tags = overlayDirs().map((dir) => {
        const kustomization = yaml.load(readText(join(dir, "kustomization.yaml"))) as { images?: { newTag?: string }[] };
        return [toPosix(dir), kustomization.images?.map((image) => String(image.newTag))];
      });
      expect(tags).toEqual(overlayDirs().map((dir) => [toPosix(dir), [version]]));
    });
  });

  describe("entry point policies", () => {
    /** What a variant renders for one app: ConfigMap, Service, and a Route and an Ingress in front of them. */
    function compliantEntryPoints(): { route: Obj; ingress: Obj; docs: Obj[] } {
      const route: Obj = {
        apiVersion: "route.openshift.io/v1",
        kind: "Route",
        metadata: { name: "reader-tutors-app" },
        spec: {
          host: "reader.tutors.dev",
          to: { kind: "Service", name: "reader-tutors-app" },
          port: { targetPort: "http" },
          tls: { termination: "edge", insecureEdgeTerminationPolicy: "Redirect" }
        }
      };
      const ingress: Obj = {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: { name: "reader-tutors-app" },
        spec: {
          ingressClassName: "nginx",
          tls: [{ hosts: ["reader.tutors.dev"], secretName: "reader-tls" }],
          rules: [
            {
              host: "reader.tutors.dev",
              http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: "reader-tutors-app", port: { name: "http" } } } }] }
            }
          ]
        }
      };
      const docs: Obj[] = [
        { kind: "ConfigMap", metadata: { name: "reader-tutors-app-config" }, data: { ORIGIN: "https://reader.tutors.dev" } },
        { kind: "Service", metadata: { name: "reader-tutors-app" }, spec: { ports: [{ name: "http", port: 80, targetPort: "http" }] } },
        route,
        ingress
      ];
      return { route, ingress, docs };
    }

    it("accept a Route and an Ingress on the ORIGIN host that target a rendered Service port", () => {
      expect(entryPointPolicyFindings(compliantEntryPoints().docs)).toEqual([]);
      expect(entryPointPolicyFindings([compliantDeployment()])).toEqual([]);
    });

    it.each<[string, (route: Obj, ingress: Obj) => void]>([
      ["host-not-origin: Route/reader-tutors-app: tutors.dev (ORIGIN is https://reader.tutors.dev)", (route) => (route.host = "tutors.dev")],
      ["entry-point-without-host: Route/reader-tutors-app", (route) => delete route.host],
      // What a component applied inside the overlay renders: the backend misses the name prefix.
      ["backend-service-not-rendered: Route/reader-tutors-app: tutors-app", (route) => ((route.to as Obj).name = "tutors-app")],
      ["backend-port-not-on-service: Route/reader-tutors-app: reader-tutors-app:metrics", (route) => ((route.port as Obj).targetPort = "metrics")],
      ["route-without-tls: Route/reader-tutors-app", (route) => delete route.tls],
      ["route-insecure-not-redirected: Route/reader-tutors-app: Allow", (route) => ((route.tls as Obj).insecureEdgeTerminationPolicy = "Allow")],
      ["route-insecure-not-redirected: Route/reader-tutors-app: unset", (route) => delete (route.tls as Obj).insecureEdgeTerminationPolicy],
      ["host-not-origin: Ingress/reader-tutors-app: tutors.dev (ORIGIN is https://reader.tutors.dev)", (_, ingress) => ((ingress.rules as Obj[])[0].host = "tutors.dev")],
      ["entry-point-without-host: Ingress/reader-tutors-app", (_, ingress) => delete (ingress.rules as Obj[])[0].host],
      [
        "backend-service-not-rendered: Ingress/reader-tutors-app: tutors-app",
        (_, ingress) => ((ingress.rules as Obj[])[0].http = { paths: [{ backend: { service: { name: "tutors-app", port: { name: "http" } } } }] })
      ],
      ["ingress-without-class: Ingress/reader-tutors-app", (_, ingress) => delete ingress.ingressClassName],
      [
        "ingress-default-backend: Ingress/reader-tutors-app: answers for every host, not only ORIGIN",
        (_, ingress) => (ingress.defaultBackend = { service: { name: "reader-tutors-app", port: { name: "http" } } })
      ],
      ["ingress-tls-host-mismatch: Ingress/reader-tutors-app: reader.tutors.dev not in tls hosts", (_, ingress) => ((ingress.tls as Obj[])[0].hosts = ["tutors.dev"])],
      ["ingress-tls-without-secret: Ingress/reader-tutors-app", (_, ingress) => delete (ingress.tls as Obj[])[0].secretName]
    ])("negative fixture: %s", (expected, mutate) => {
      const { route, ingress, docs } = compliantEntryPoints();
      mutate(route.spec as Obj, ingress.spec as Obj);
      expect(entryPointPolicyFindings(docs)).toContain(expected);
    });

    it("a passthrough Route needs no redirect policy, and an Ingress needs no TLS block", () => {
      const { route, ingress, docs } = compliantEntryPoints();
      (route.spec as Obj).tls = { termination: "passthrough" };
      delete (ingress.spec as Obj).tls;
      expect(entryPointPolicyFindings(docs)).toEqual([]);
    });

    it("every app has a kind (Ingress) and an openshift (Route) variant of its overlay", () => {
      const apps = overlayDirs().map((dir) => toPosix(dir, join(REPO_ROOT, "deploy/k8s/overlays")));
      const expected = ["kind", "openshift"].flatMap((substrate) => apps.map((app) => `${substrate}/${app}`));
      expect(variantDirs().map((dir) => toPosix(dir, join(REPO_ROOT, "deploy/k8s/variants")))).toEqual(expected);
    });

    it("every variant renders its overlay unchanged plus one entry point named and labelled like the Service", () => {
      for (const dir of variantDirs()) {
        const [substrate, app] = toPosix(dir, join(REPO_ROOT, "deploy/k8s/variants")).split("/");
        const overlay = yaml.loadAll(renderKustomization(join(REPO_ROOT, "deploy/k8s/overlays", app))) as Obj[];
        const variant = yaml.loadAll(renderKustomization(dir)) as Obj[];
        const rendered = new Set(overlay.map((doc) => JSON.stringify(doc)));
        const added = variant.filter((doc) => !rendered.has(JSON.stringify(doc)));
        expect(variant.length, dir).toBe(overlay.length + 1);
        expect(added.map((doc) => doc.kind), dir).toEqual([substrate === "openshift" ? "Route" : "Ingress"]);
        const service = overlay.find((doc) => doc.kind === "Service")!.metadata as Obj;
        expect(added[0].metadata, dir).toEqual({ name: service.name, labels: service.labels });
        expect([...manifestPolicyFindings(variant), ...entryPointPolicyFindings(variant)], dir).toEqual([]);
      }
    }, 120_000);
  });

  describe("configuration completeness", () => {
    it("reads env access in every form the apps use", () => {
      const source = `
        const a = env.PUBLIC_SUPABASE_URL;
        const b = process.env.LOG_LEVEL;
        const c = (options.env ?? serverEnv()).METRICS_TOKEN;
        const d = env?.MOODLE_WS_URL;
        const e = env["SYNC_INTERVAL_MINUTES"];
        import { PUBLIC_PDF_KEY, PRIVATE_X as renamed } from "$env/static/private";
        const notEnv = config.TIMEOUT;
      `;
      expect(envVarsRead(source).sort()).toEqual([
        "LOG_LEVEL",
        "METRICS_TOKEN",
        "MOODLE_WS_URL",
        "PRIVATE_X",
        "PUBLIC_PDF_KEY",
        "PUBLIC_SUPABASE_URL",
        "SYNC_INTERVAL_MINUTES"
      ]);
    });

    it("collects keys from dotenv files, ConfigMaps, Secrets and overlay patches", () => {
      expect([...dotenvKeys("# comment\nA=1\nexport B=\n  C=x\nlower=no\n")]).toEqual(["A", "B", "C"]);
      const keys = k8sEnvKeys([
        { file: "cm.yaml", text: "kind: ConfigMap\ndata:\n  ORIGIN: x\n---\nkind: Secret\nstringData:\n  TOKEN: y\n" },
        { file: "kustomization.yaml", text: "patches:\n  - patch: |\n      - op: add\n        path: /data/EXTRA\n" }
      ]);
      expect([...keys].sort()).toEqual(["EXTRA", "ORIGIN", "TOKEN"]);
    });

    it("negative fixture: a variable read in code but documented in neither place is reported twice", () => {
      const findings = configCompletenessFindings(
        [
          { file: "apps/x/src/a.ts", text: "env.NEW_FLAG; env.DOCUMENTED; import.meta.env.DEV; process.env.HOSTNAME" },
          { file: "apps/x/src/b.ts", text: "env.ONLY_IN_DOTENV" }
        ],
        { envExample: new Set(["DOCUMENTED", "ONLY_IN_DOTENV"]), k8s: new Set(["DOCUMENTED"]) }
      );
      expect(findings).toEqual([
        "undocumented-env: .env.example: NEW_FLAG (read in apps/x/src/a.ts)",
        "undocumented-env: deploy/k8s: NEW_FLAG (read in apps/x/src/a.ts)",
        "undocumented-env: deploy/k8s: ONLY_IN_DOTENV (read in apps/x/src/b.ts)"
      ]);
    });

    it("every env var the apps read is in .env.example and in the kustomize manifests", () => {
      expect(repoConfigCompletenessFindings()).toEqual([]);
    });
  });

  describe("frozen clock (HARNESS_NOW)", () => {
    it("negative fixture: a manifest that sets HARNESS_NOW is reported", () => {
      expect(
        frozenClockFindings([
          { file: "deploy/k8s/base/configmap.yaml", text: "data:\n  HARNESS_NOW: 2026-09-16T09:05:00.000Z\n" },
          { file: "deploy/k8s/base/service.yaml", text: "kind: Service\n" }
        ])
      ).toEqual(["frozen-clock-in-deployment: deploy/k8s/base/configmap.yaml: HARNESS_NOW"]);
    });

    it("no deployment manifest or compose file in the repo can freeze the clock", () => {
      expect(repoFrozenClockFindings()).toEqual([]);
    });
  });
});
