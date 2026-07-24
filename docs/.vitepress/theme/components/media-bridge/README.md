# Media bridge internals

The sync bridge stays browser-local. `engine.ts` owns the complete lifecycle:
endpoint validation, concurrent snapshots, Nuvio alias enrichment, identity
coalescing, deterministic destination resolution, planning, writing, selective
verification, and result aggregation.

- `identity.ts` builds namespace-safe identity components and endpoint-scopes
  Plex/Jellyfin local IDs.
- `planner.ts` is additive and never creates removals.
- `contracts.ts` defines provider snapshots, mapping, write receipts, and
  structured run events.
- `adapters/` exposes one adapter per supported service.
- `transport.ts` contains shared request, pacing, retry, and concurrency tools.
- `legacy-providers.ts` contains the existing proven provider wire
  implementations while the public `mediaBridgeProviders.ts` file acts as a
  compatibility facade.

The architecture was designed as a clean-room implementation after reviewing
CrossWatch's public separation of identity, inventories, planning, applying,
and verification. No CrossWatch source code is included or copied.
