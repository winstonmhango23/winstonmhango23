import type { ApiCollateral } from '@/lib/data/api';
import * as data from '@/lib/data';

export type PropertyDetailSource =
  | { kind: 'application'; applicationId: number }
  | { kind: 'loan'; loanId: number }
  | { kind: 'vault'; clientId: number }
  | { kind: 'borrower-application'; applicationId: number }
  | { kind: 'borrower-vault' };

export function propertyDetailHref(
  collateralId: number,
  source: PropertyDetailSource,
  portal: 'staff' | 'client'
): string {
  const base = portal === 'staff' ? '/(staff)/property' : '/(client)/property';
  const q = new URLSearchParams({ kind: source.kind });
  if ('applicationId' in source && source.applicationId != null) {
    q.set('applicationId', String(source.applicationId));
  }
  if ('loanId' in source && source.loanId != null) {
    q.set('loanId', String(source.loanId));
  }
  if ('clientId' in source && source.clientId != null) {
    q.set('clientId', String(source.clientId));
  }
  return `${base}/${collateralId}?${q.toString()}`;
}

export function parsePropertyDetailSource(params: Record<string, string | string[] | undefined>): PropertyDetailSource | null {
  const kind = String(params.kind ?? '');
  const applicationId = params.applicationId != null ? Number(params.applicationId) : NaN;
  const loanId = params.loanId != null ? Number(params.loanId) : NaN;
  const clientId = params.clientId != null ? Number(params.clientId) : NaN;

  switch (kind) {
    case 'application':
      if (!Number.isFinite(applicationId)) return null;
      return { kind: 'application', applicationId };
    case 'loan':
      if (!Number.isFinite(loanId)) return null;
      return { kind: 'loan', loanId };
    case 'vault':
      if (!Number.isFinite(clientId)) return null;
      return { kind: 'vault', clientId };
    case 'borrower-application':
      if (!Number.isFinite(applicationId)) return null;
      return { kind: 'borrower-application', applicationId };
    case 'borrower-vault':
      return { kind: 'borrower-vault' };
    default:
      return null;
  }
}

export async function loadPropertyCollateral(
  collateralId: number,
  source: PropertyDetailSource
): Promise<ApiCollateral | null> {
  let items: ApiCollateral[] = [];
  switch (source.kind) {
    case 'application':
      items = await data.getApplicationCollateral(source.applicationId);
      break;
    case 'loan':
      items = await data.getLoanCollateral(source.loanId);
      break;
    case 'vault':
      items = await data.getClientCollateralVault(source.clientId);
      break;
    case 'borrower-application':
      items = await data.getBorrowerApplicationCollateral(source.applicationId);
      break;
    case 'borrower-vault':
      items = await data.getBorrowerCollateralVault();
      break;
    default:
      return null;
  }
  return items.find((c) => c.id === collateralId) ?? null;
}

export async function updatePropertyCollateralLocation(
  collateralId: number,
  source: PropertyDetailSource,
  location: import('@/lib/data/geolocation-types').GeolocationInput
): Promise<void> {
  switch (source.kind) {
    case 'application':
      await data.setApplicationCollateralLocation(source.applicationId, collateralId, location);
      return;
    case 'loan':
      await data.setLoanCollateralLocation(source.loanId, collateralId, location);
      return;
    case 'vault':
      await data.setCollateralGeolocation(collateralId, location);
      return;
    case 'borrower-application':
      await data.setBorrowerApplicationCollateralLocation(source.applicationId, collateralId, location);
      return;
    case 'borrower-vault':
      await data.setBorrowerVaultCollateralLocation(collateralId, location);
      return;
    default:
      throw new Error('Cannot update location for this property source');
  }
}
