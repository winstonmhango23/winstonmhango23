import {
  mergeCollateralPortfolio,
  mergeGuarantorPortfolio,
  resolvePortfolioApplicationId,
  toPortfolioApplicationRef,
  VAULT_APP_REF,
} from '@/lib/client-portal/security-portfolio';
import type { ApiCollateral, ApiGuarantor } from '@/lib/data/api';

describe('security portfolio helpers', () => {
  it('resolves remote application ids from store-like rows', () => {
    expect(resolvePortfolioApplicationId({ id: 'local-1', remote_id: 42 })).toBe(42);
    expect(resolvePortfolioApplicationId({ id: 7 })).toBe(7);
    expect(resolvePortfolioApplicationId({ id: '15' })).toBe(15);
    expect(resolvePortfolioApplicationId({ id: 'local-1' })).toBeNull();
  });

  it('builds application refs for synced rows only', () => {
    expect(
      toPortfolioApplicationRef({
        id: 9,
        application_number: 'APP-9',
        product_name: 'Village SME',
        status: 'DRAFT',
      })
    ).toEqual({
      id: 9,
      application_number: 'APP-9',
      product_name: 'Village SME',
      status: 'DRAFT',
    });
    expect(toPortfolioApplicationRef({ id: 'local-x' })).toBeNull();
  });

  it('merges vault collateral ahead of pledged application rows', () => {
    const vault: ApiCollateral[] = [
      { id: 2, collateral_type: 'REAL_ESTATE', description: 'Plot', estimated_value: 100 },
      {
        id: 1,
        collateral_type: 'VEHICLE',
        description: 'Inactive',
        estimated_value: 50,
        is_active: false,
      },
    ];
    const ref = {
      id: 9,
      application_number: 'APP-9',
      product_name: null,
      status: 'DRAFT',
    };
    const merged = mergeCollateralPortfolio({
      vault,
      perApplication: [
        {
          ref,
          rows: [
            {
              id: 3,
              collateral_type: 'EQUIPMENT',
              description: 'Mill',
              estimated_value: 200,
            },
          ],
        },
      ],
    });
    expect(merged).toHaveLength(2);
    expect(merged[0].is_vault).toBe(true);
    expect(merged[0].application).toEqual(VAULT_APP_REF);
    expect(merged[1].id).toBe(3);
    expect(merged[1].application.id).toBe(9);
  });

  it('merges catalog guarantors and skips released rows', () => {
    const catalog: ApiGuarantor[] = [
      { id: 1, full_name: 'Ada', status: 'ACTIVE' },
      { id: 2, full_name: 'Bob', status: 'RELEASED' },
    ];
    const ref = {
      id: 5,
      application_number: 'APP-5',
      product_name: 'Agri',
      status: 'SUBMITTED',
    };
    const merged = mergeGuarantorPortfolio({
      catalog,
      perApplication: [{ ref, rows: [{ id: 9, full_name: 'Cara' }] }],
    });
    expect(merged.map((g) => g.full_name)).toEqual(['Ada', 'Cara']);
    expect(merged[0].is_vault).toBe(true);
    expect(merged[1].application.application_number).toBe('APP-5');
  });
});
