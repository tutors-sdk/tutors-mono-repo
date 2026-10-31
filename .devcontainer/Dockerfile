# Pinned by digest (production hardening 1.3, Rule 0668). Dependabot's docker
# ecosystem moves this line; its devcontainers ecosystem only moves Features.
FROM mcr.microsoft.com/devcontainers/typescript-node:5-26-bookworm@sha256:fc4b4da3bc5809f717860a9cd1936429774c2a41215cc2ab5d90e6160923eff6

# The published devcontainer can lag behind the Node release pinned in .nvmrc.
ENV NODE_VERSION=26.13.0
RUN . "${NVM_DIR}/nvm.sh" && nvm install "${NODE_VERSION}" && nvm alias default "${NODE_VERSION}"
