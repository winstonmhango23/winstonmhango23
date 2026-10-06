import { staffListFetchOpts } from '@/lib/staff/cio-offline';

describe('staffListFetchOpts', () => {
  it('scopes CIO/SCIO bootstrap to the supervised credit book', () => {
    expect(
      staffListFetchOpts({
        backendRole: 'CREDIT_INVESTMENT_OFFICER',
        creditBook: 'SME',
      })
    ).toEqual({ supervisedOnly: true, creditBook: 'SME' });
    expect(
      staffListFetchOpts({
        backendRole: 'SCIO',
        creditBook: 'AGRICULTURAL',
      })
    ).toEqual({ supervisedOnly: true, creditBook: 'GROUP' });
  });

  it('leaves loan officers on the unscoped staff fetch', () => {
    expect(staffListFetchOpts({ backendRole: 'LOAN_OFFICER', creditBook: 'SME' })).toEqual({});
  });
});
