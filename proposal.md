# Title Page

**Project Title:** AI-Augmented Learning Platform: Intelligent Tutoring Agents on Cloud-Native Infrastructure

**Student Name:** [Student Name]

**Student ID:** [Student ID]

**Programme:** [Programme Title]

**Supervisor:** [Supervisor Name]

**Collaborating Organisation:** Red Hat

**Date:** August 2026

---

# Project Proposal

## Project Type

Research

## Project Category

Research / CI-CD Pipeline / Web App

## Proposal

Tutors (tutors.dev) is an open-source educational platform that enables educators to author courses in Markdown and deliver them through interactive web applications. The platform serves three distinct personas: students who consume learning content, instructors who author courses and monitor engagement, and developers who maintain and extend the platform. Currently, Tutors operates as a collection of SvelteKit applications deployed to Netlify with Supabase as the data layer and PartyKit for real-time WebSocket presence. There is no containerisation, no orchestration layer, and no AI capability.

This project proposes to introduce an AI-trained agent that serves each of the three Tutors personas with tailored, real-time assistance, deployed on hardened cloud-native infrastructure.

For the **student**, the AI agent will act as a pedagogically constrained real-time tutor. Unlike a conventional RAG system that retrieves and presents information on demand, this agent dynamically determines what assistance it is permitted to provide. The constraint model considers the student's current position in the course, the learning objectives of the active topic, whether the activity is formative or assessed, the student's prior interaction history, and — critically — pedagogical policy defined by the lecturer. This means the same question could produce a full conceptual explanation during a lecture, a guided hint during a lab exercise, or a refusal to answer during an assessed activity. The lecturer authors these policies alongside their course content, defining per-topic and per-activity rules for how much assistance the agent may offer. This ensures the AI supports learning rather than bypassing it, and gives instructors fine-grained control over the boundary between help and academic integrity.

For the **instructor**, the agent will provide aggregate observability. Rather than manually reviewing analytics dashboards, the instructor will be able to query the agent for insights: which students are struggling, which topics have low engagement, and how cohort activity compares across time periods. The agent synthesises data from Supabase learning records, calendar heatmaps, and real-time presence into actionable summaries.

For the **developer**, the agent will close the feedback loop on feature adoption. By analysing usage telemetry, it will surface which platform capabilities are actively used, which are underutilised, and where user friction exists. This informs roadmap decisions and identifies technical debt that affects real users.

To support these capabilities, the Tutors ecosystem must be containerised. Each application (reader, catalogue, live, time) and service (PartyKit, Supabase edge functions) will be packaged as OCI-compliant container images and deployed onto a Kubernetes cluster. This introduces production-grade orchestration: horizontal scaling, health monitoring, rolling deployments, and secrets management. The collaboration with Red Hat provides access to OpenShift expertise and enterprise Kubernetes tooling.

The AI model will be trained using an open-source foundation model fine-tuned on Tutors course data. The training pipeline, inference server, and all supporting infrastructure will be fully open source, consistent with the philosophy of the Tutors project. Model serving will run as a Kubernetes workload alongside the application containers, enabling low-latency inference without external API dependencies.

The project will be delivered as a series of production-quality incremental releases, each adding a functional layer: containerisation first, then Kubernetes deployment, then model training, and finally persona-specific agent integration.

## Technologies

### Software and Languages

| Technology | Purpose |
|---|---|
| TypeScript / Svelte 5 | Existing Tutors application code |
| Python | Model training pipeline and data preprocessing |
| Go | Kubernetes operators and CLI tooling (if required) |
| SQL (PostgreSQL) | Supabase data layer for analytics and learning records |
| Markdown | Course content authoring format |
| YAML | Kubernetes manifests, Helm charts, CI/CD configuration |

### Infrastructure and Platforms

| Technology | Purpose |
|---|---|
| Kubernetes / OpenShift | Container orchestration and deployment |
| Podman / Docker | OCI container image building |
| Helm | Kubernetes package management |
| Supabase | Database, authentication, analytics storage |
| GitHub Actions | CI/CD pipeline for build, test, and deploy |

### AI and Machine Learning

| Technology | Purpose |
|---|---|
| Open-source foundation model (e.g. Llama, Mistral) | Base model for fine-tuning |
| RAG (Retrieval-Augmented Generation) | Course content retrieval for contextual responses |
| vLLM or Ollama | Model serving on Kubernetes |
| LangChain or LlamaIndex | Agent orchestration and tool integration |
| ChromaDB or Pgvector | Vector store for course content embeddings |
| Pedagogical policy engine | Rule evaluation over course structure, activity type, and assessment state to constrain agent responses |

## Tools and Frameworks

| Tool / Framework | Role |
|---|---|
| SvelteKit 2 | Web application framework (existing) |
| Vite 8 | Build tooling (existing) |
| Vitest / Playwright | Testing (unit, integration, E2E) |
| pnpm workspaces | Monorepo dependency management (existing) |
| OpenShift / kubectl | Kubernetes cluster management |
| Skaffold or Tilt | Local Kubernetes development workflow |
| Grafana / Prometheus | Observability and monitoring |
| ArgoCD or Flux | GitOps continuous deployment |
| Hugging Face Transformers | Model fine-tuning toolkit |
| Redis | Caching layer for inference results |

## Project Process

The project will follow an **incremental delivery** model with production-quality releases at each stage:

1. **Phase 1 — Containerisation:** Package each Tutors application and service as OCI container images. Establish multi-stage Dockerfiles, local development workflow with Podman, and container registry publishing via CI.

2. **Phase 2 — Kubernetes Deployment:** Deploy containerised applications to a Kubernetes cluster. Define Helm charts, configure ingress, secrets management, health probes, and horizontal pod autoscaling. Validate with Red Hat OpenShift.

3. **Phase 3 — Model Training and Serving:** Build the data pipeline to extract and embed Tutors course content. Fine-tune an open-source foundation model on this data. Deploy the inference server as a Kubernetes workload with RAG for contextual retrieval.

4. **Phase 4 — Agent Integration:** Implement persona-specific AI agents within the Tutors web applications. The student-facing tutor in the reader app, governed by the pedagogical constraint engine that evaluates lecturer-defined policy, activity type, and assessment state before each response. The instructor-facing analytics agent in the time app. Developer-facing usage insights via CLI or dashboard.

5. **Phase 5 — Hardening and Evaluation:** Security review, load testing, GDPR compliance validation, and user evaluation with real courses and students.

Each phase produces a deployable, testable artefact. Phases overlap where dependencies allow.

## Stakeholders

| Stakeholder | Role |
|---|---|
| **Tutors Project** (tutors.dev) | Open-source platform — the software being extended |
| **Red Hat** | Collaborating organisation — OpenShift/Kubernetes expertise, infrastructure guidance |
| **SETU** | Academic institution — project supervision and evaluation |
| **Students** (end users) | Primary consumers of AI-assisted learning features |
| **Instructors** (end users) | Consumers of AI-driven analytics and observability |
| **Open-source community** | Contributors and adopters of the platform |
