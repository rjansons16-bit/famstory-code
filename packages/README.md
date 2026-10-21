# packages/ — reserved

This folder is empty for now. It is the place for the domain logic shared
between the mobile app and the API.

## What will live here

`visibility.ts`, `categories.ts`, `plans.ts` and the domain types. Right now they
exist in two places:

- `apps/mobile/src/domain/`
- `apps/api/src/modules/visibility/` and `apps/api/prisma/schema.prisma`

## Why not yet

An npm workspace with a shared package needs Metro `watchFolders` configuration
and a separate build step. At the MVP stage, with the API not yet running, that
adds complexity which does not pay for itself.

## When to extract

Together with stage C (`docs/00-PLAN.md`) — the moment the API starts serving
real requests and both sides begin to change at once.

It is no longer only a theoretical concern: the category keyword lists in
`apps/mobile/src/domain/categories.ts` and `apps/api/src/modules/ai/ai.service.ts`
have already drifted apart once. Item 11 in
[`docs/07-IMPROVEMENTS.md`](../docs/07-IMPROVEMENTS.md) tracks it.

Until then **the canonical specification is
[`docs/02-DATA-MODEL.md`](../docs/02-DATA-MODEL.md)**, and both implementations
have to be kept in line with it.
