export type {
  AccountPrincipal,
  AccountRole,
  ActiveAccountScope,
} from '@/lib/account-scope/types';
export {
  ACCOUNT_SCOPE_PREFIX,
  ACTIVE_SCOPE_META_KEY,
} from '@/lib/account-scope/types';
export {
  buildAccountScopeId,
  fingerprintAccessToken,
  normalizeAccountRole,
  scopedDatabaseName,
  scopedKvKey,
  SHARED_AUTH_DATABASE_NAME,
} from '@/lib/account-scope/ids';
export {
  activateAccountScope,
  clearActiveAccountScope,
  getActiveAccountScope,
  getActiveAccountScopeId,
  requireActiveAccountScopeId,
  restoreActiveAccountScopeMeta,
} from '@/lib/account-scope/active-scope';
export {
  scopedGetItem,
  scopedGetItemOptional,
  scopedRemoveItem,
  scopedSetItem,
} from '@/lib/account-scope/scoped-kv';
export { resetAccountScopedMemoryStores } from '@/lib/account-scope/reset-stores';
