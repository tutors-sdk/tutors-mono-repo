# syntax=docker/dockerfile:1
# Negative fixture for scripts/checks/container-smoke.ts. Healthy by default;
# FIXTURE_FAULT reproduces the two ways an image passes locally as root but
# fails under OpenShift's restricted SCC:
#   readonly  writes to its own filesystem at startup (read-only root)
#   uid       reads a file only UID 1001 may read (arbitrary UID)
FROM docker.io/library/node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9
WORKDIR /app
COPY server.mjs ./
RUN echo '{"secret":true}' > private.json && chown 1001:0 private.json && chmod 600 private.json
USER 1001
EXPOSE 3000
CMD ["node", "server.mjs"]
