/**
 * Profile sub-screen navigation — Expo tabs + stacks make router.back() land on Home.
 * Explicitly return to Profile (or an intermediate list) instead.
 */

import type { Href } from 'expo-router';

export const CLIENT_PROFILE_HREF = '/(client)/profile' as Href;
export const CLIENT_GROUP_MEMBERS_HREF = '/(client)/group-members' as Href;
export const CLIENT_GROUP_LEADERS_HREF = '/(client)/group-leaders' as Href;
export const CLIENT_SYNC_HREF = '/(client)/sync' as Href;
export const CLIENT_COLLATERAL_VAULT_HREF = '/(client)/collateral-vault' as Href;
export const CLIENT_DOCUMENTS_HREF = '/(client)/documents' as Href;
export const CLIENT_GUARANTORS_HREF = '/(client)/guarantors' as Href;

type ReplaceRouter = {
  replace: (href: Href) => void;
};

export function navigateBackToProfile(router: ReplaceRouter): void {
  router.replace(CLIENT_PROFILE_HREF);
}

export function navigateBackToGroupMembers(router: ReplaceRouter): void {
  router.replace(CLIENT_GROUP_MEMBERS_HREF);
}

export function navigateBackToSync(router: ReplaceRouter): void {
  router.replace(CLIENT_SYNC_HREF);
}

export function navigateBackToCollateralVault(router: ReplaceRouter): void {
  router.replace(CLIENT_COLLATERAL_VAULT_HREF);
}
