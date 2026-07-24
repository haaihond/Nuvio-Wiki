import type {
  BridgeScope,
  CanonicalBundle,
  MediaRef,
  ServiceCapabilities,
  ServiceId,
  SyncScopes
} from './core.ts'
import type {
  BridgeConnection,
  BridgeIssue,
  BridgeLog,
  DestinationMappingIssue,
  MediaBridgeVerificationCheckpoint,
  PullResult,
  PushResult
} from './legacy-providers.ts'

export type WriteReceiptStatus = 'confirmed' | 'accepted' | 'skipped' | 'failed'

export interface WriteReceipt {
  id: string
  recordKey?: string
  scope: BridgeScope
  status: WriteReceiptStatus
  media: MediaRef
  destinationKey?: string | null
  code?: string
  reason?: string
}

export interface ProviderWriteResult extends PushResult {
  receipts: WriteReceipt[]
}

export interface ProviderSnapshotOptions {
  connection: BridgeConnection
  scopes: SyncScopes
  log?: BridgeLog
}

export interface ProviderResolveOptions extends ProviderSnapshotOptions {
  source: CanonicalBundle
  sourceConnection: BridgeConnection
}

export interface ProviderWriteOptions extends ProviderSnapshotOptions {
  bundle: CanonicalBundle
}

export interface ProviderVerifyOptions extends ProviderSnapshotOptions {
  baseline: CanonicalBundle
  checkpoint: MediaBridgeVerificationCheckpoint
}

export interface ProviderAdapter {
  readonly id: ServiceId
  readonly capabilities: ServiceCapabilities
  snapshot(options: ProviderSnapshotOptions): Promise<PullResult>
  resolveDestination(options: ProviderResolveOptions): Promise<DestinationMappingIssue[]>
  write(options: ProviderWriteOptions): Promise<ProviderWriteResult>
  createCheckpoint(
    options: Pick<ProviderSnapshotOptions, 'connection' | 'log'>
  ): Promise<MediaBridgeVerificationCheckpoint>
  verify(options: ProviderVerifyOptions): Promise<PullResult>
}

export type BridgeRunPhase =
  | 'validate'
  | 'read'
  | 'enrich'
  | 'normalize'
  | 'resolve'
  | 'plan'
  | 'write'
  | 'verify'
  | 'complete'

export interface BridgeRunEvent {
  at: number
  phase: BridgeRunPhase
  provider?: ServiceId
  scope?: BridgeScope
  level: 'info' | 'warning' | 'error'
  message: string
  counts?: Partial<Record<BridgeScope | 'source' | 'changes' | 'skipped', number>>
}

export type BridgeRunEventHandler = (event: BridgeRunEvent) => void

export interface BridgePreparedPlan {
  source: CanonicalBundle
  destination: CanonicalBundle
  plan: import('./planner.ts').MediaBridgePreviewPlan
  issues: BridgeIssue[]
}
