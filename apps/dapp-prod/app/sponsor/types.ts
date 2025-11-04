export interface CreatedSafe {
  request_id: string;
  status: string;
  safe_address?: string | null;
  transaction_url?: string | null;
  status_url?: string | null;
  cluster: string;
  threshold: number;
  members: string[];
  mode: string;
  raw_response?: unknown;
  idempotency_key?: string | null;
  creator_wallet: string;
  attn_wallet: string;
  import_source?: string | null;
  import_metadata?: unknown;
  imported_at?: string | null;
  attempt_count: number;
  last_attempt_at: string;
  next_retry_at?: string | null;
  status_last_checked_at?: string | null;
  status_sync_error?: string | null;
  status_last_response_hash?: string | null;
  creator_vault?: string | null;
  governance_linked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeDetectionEventDetail {
  record: CreatedSafe;
  type?: 'existing' | 'new';
}
