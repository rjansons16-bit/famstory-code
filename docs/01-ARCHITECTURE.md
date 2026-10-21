# Technical architecture

The study's recommendation, followed here:

> "Given the nature of the FamStory product, where the family data model,
> privacy management, event visibility control, subscription mechanisms, future
> AI features and international SaaS scalability all matter, **a centralised API
> architecture with a modular backend is recommended**."

And, in the same place, a warning against over-building:

> "At the MVP stage this architecture does not need to be built as a full
> microservice system. The practical approach is to **start with a modular
> monolith**."

---

## The stack

| Layer | Choice | Why this one |
|-------|--------|--------------|
| Mobile app | **Expo (React Native) + TypeScript** | One codebase for iOS and Android. The study: "if the team has React Native competence, React Native is recommended, as it connects well with the TypeScript/NestJS backend ecosystem." Expo gives OTA updates, which a beta needs daily |
| Navigation | **expo-router** | File-based; deep linking for invitation links works with no extra work |
| State | **zustand** | No boilerplate, no context tree. When the backend arrives only the action bodies change |
| API | **NestJS / TypeScript** | Module boundaries live at the language level, not at the level of an agreement. That is the only thing that keeps a modular monolith from dissolving |
| Database | **PostgreSQL** | Family → members → groups → events → visibility is a relational model. A document database would pay for it in complicated visibility checks |
| ORM | **Prisma** | The schema as one file, types generated, migrations versioned |
| Queues | **Redis + BullMQ** | Reminders, push fan-out, exports, AI batches |
| Files | **S3-compatible object storage** | Presigned URLs — a file link lives for minutes, not forever |
| Push | **FCM + APNs** | |
| AI | **A separate service** behind an interface | MVP: rules. V2: an LLM. No API change |
| Monitoring | **Sentry EU** | An EU region is a requirement, not a preference — the data contains information about children |

**Firebase is not used.** The study allows it as a fast route to an MVP, but in
the same place lists "vendor lock-in" as a risk and "harder relational data
modelling, limited flexibility for complex AI, multi-tenant and role logic" as a
limitation. FamStory's core *is* multi-tenant role and visibility logic — which
is exactly what makes Firebase a poor fit for this particular product.

---

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  Clients                                                  │
│  iOS · Android · (a web admin later)                      │
└───────────────┬──────────────────────────────────────────┘
                │  HTTPS / WebSocket / Push
┌───────────────▼──────────────────────────────────────────┐
│  API Gateway                                              │
│  Auth · Rate limit · i18n · Versioning · Audit log        │
└───────────────┬──────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────┐
│  Domain modules (one process, clear boundaries)           │
│                                                           │
│  identity · families · groups · events · comments         │
│  notifications · subscription · ai-gateway · export       │
│                                                           │
│         ┌─────────────────────────────┐                   │
│         │  visibility (cross-cutting) │ ← every query     │
│         └─────────────────────────────┘   goes through it │
└───────────────┬──────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────┐
│  Data:  PostgreSQL · Redis · Object storage               │
└──────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────┐
│  Background work:  reminders · push fan-out · exports     │
└──────────────────────────────────────────────────────────┘
```

---

## Why `visibility` is a module of its own

It is the only logic that has to be called on **every** read path: timeline,
calendar, search, event detail, notifications, export, AI input.

If every module implements it itself, a path where the check was skipped appears
quickly. And a skipped visibility check in this product means a grandparent sees
what a parent deliberately hid. The study calls this "lack of trust in a new
family-data product" — an elevated risk with high impact.

So:
- one function that produces the `WHERE` clause for a Prisma query;
- a guard that applies it at endpoint level, not only in the service;
- the same logic on the client (`apps/mobile/src/domain/visibility.ts`) — but
  **for UX only**. A client-side check is not a security boundary.

---

## Why a modular monolith and not microservices

The study's MVP budget is EUR 190,000–220,000, and technical maintenance is
EUR 3,000–8,000 a month. Microservices with 50–200 beta families means paying for
orchestration that solves no real problem.

The modular monolith defers that without spoiling the future: when one module
(most likely `ai-gateway` or `export`) starts demanding a different scaling
profile, it gets extracted. That is only possible if the module boundaries
already exist — which is why the NestJS modules are there from day one rather
than after a year.

---

## Why the mobile app works without a backend

`apps/mobile/src/data/store.ts` currently keeps everything in memory and takes
its data from `mock.ts`. Every action carries a `// TODO(api):` comment naming
the exact endpoint.

This is not a way of saving time. The study's roadmap puts the UX prototype
(months 2–4) **before** MVP development (months 4–10), and places the decision
point "do users understand the product's value and its main flows?" at months
3–4.

That question cannot be answered with a Figma file. It can be answered with an
app somebody is holding. The mock layer makes that possible without building the
backend prematurely.

---

## File structure

```
famstory/
├── docs/                      ← plan, architecture, data model, design brief
├── apps/
│   ├── mobile/                ← the Expo app (WORKS)
│   │   └── src/
│   │       ├── app/           ← expo-router routes
│   │       ├── components/    ← ui/ (generic) + event/ + calendar/
│   │       ├── data/          ← store.ts + mock.ts
│   │       ├── domain/        ← types, visibility, categories, plans, analytics
│   │       ├── i18n/          ← strings.ts
│   │       ├── lib/           ← date.ts
│   │       └── theme/         ← tokens.ts ← THE DESIGN HANDOFF FILE
│   └── api/                   ← NestJS + Prisma
│       ├── prisma/schema.prisma
│       └── src/modules/
└── packages/                  ← reserved for shared code, see packages/README.md
```

### On the duplicated domain logic

`visibility.ts`, `categories.ts` and `plans.ts` exist both in
`apps/mobile/src/domain/` and on the API side. That was a deliberate trade-off
for the MVP stage: an npm workspace with a shared package adds Metro
configuration complexity that does not pay for itself yet.

It has since stopped being theoretical. During the English conversion the
category keyword lists in `apps/mobile/src/domain/categories.ts` and
`apps/api/src/modules/ai/ai.service.ts` drifted apart, and the app and the server
briefly suggested different categories for the same title. They were brought back
in line, and `ai.service.spec.ts` now carries a test that fails if they diverge
again — but a test that catches drift is not the same as a structure that
prevents it.

**The canonical specification is [`02-DATA-MODEL.md`](02-DATA-MODEL.md).** When
the backend goes live (stage C), these files should be extracted to
`packages/shared` and both sides switched over. Until then every one of them
carries a comment about staying in sync.
