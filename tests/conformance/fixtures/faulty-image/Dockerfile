# syntax=docker/dockerfile:1
# Negative fixture for scripts/checks/container-smoke.ts. Healthy by default;
# FIXTURE_FAULT reproduces the two ways an image passes locally as root but
# fails under OpenShift's restricted SCC:
#   readonly  writes to its own filesystem at startup (read-only root)
#   uid       reads a file only UID 1001 may read (arbitrary UID)
FROM node:22-bookworm-slim
WORKDIR /app
COPY server.mjs ./
RUN echo '{"secret":true}' > private.json && chown 1001:0 private.json && chmod 600 private.json
USER 1001
EXPOSE 3000
CMD ["node", "server.mjs"]
