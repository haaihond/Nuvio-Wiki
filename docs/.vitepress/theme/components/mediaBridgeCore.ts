/**
 * Compatibility facade for the browser-local sync bridge.
 *
 * New code belongs in ./media-bridge; this export keeps existing consumers and
 * integrations source-compatible during the engine migration.
 */
export * from './media-bridge/core.ts'
