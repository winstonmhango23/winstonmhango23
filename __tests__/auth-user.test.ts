import {
  normalizeAuthUser,
  resolveClientDisplayEmail,
  resolveClientDisplayName,
} from '@/lib/auth-user';

describe('auth-user normalization', () => {
  it('maps legacy snake_case stored user fields', () => {
    const user = normalizeAuthUser({
      id: 42,
      email: 'client@cofi.mw',
      full_name: 'Jane Banda',
      phone_number: '+265991234567',
      role: 'client',
      is_group_admin: true,
    });

    expect(user.fullName).toBe('Jane Banda');
    expect(user.phoneNumber).toBe('+265991234567');
    expect(user.isGroupAdmin).toBe(true);
  });

  it('prefers auth user name over session and profile fallbacks', () => {
    const user = normalizeAuthUser({
      id: 1,
      email: 'a@b.com',
      fullName: 'Stored Name',
      role: 'client',
    });

    expect(
      resolveClientDisplayName(user, 'Session Name', 'Profile Name')
    ).toBe('Stored Name');
  });

  it('falls back to session then profile when auth name is empty', () => {
    const user = normalizeAuthUser({
      id: 1,
      email: 'a@b.com',
      fullName: '',
      role: 'client',
    });

    expect(resolveClientDisplayName(user, 'Session Name', 'Profile Name')).toBe(
      'Session Name'
    );
    expect(resolveClientDisplayName(user, '', 'Profile Name')).toBe('Profile Name');
  });

  it('does not show Guest when a token-backed user exists without name yet', () => {
    const user = normalizeAuthUser({
      id: 1,
      email: 'client@cofi.mw',
      fullName: '',
      role: 'client',
    });

    expect(resolveClientDisplayName(user, null, null)).toBe('client');
    expect(resolveClientDisplayEmail(user, null)).toBe('client@cofi.mw');
  });

  it('shows Guest only when no identity hints exist', () => {
    expect(resolveClientDisplayName(null, null, null)).toBe('Guest');
  });

  it('does not treat backend job titles as portal role', () => {
    const user = normalizeAuthUser(
      {
        id: 2,
        email: 'loanofficer1@gmail.com',
        fullName: 'Loan Officer',
        role: 'Loan Officer',
        employee_id: 'LO-001',
      },
      'client'
    );

    expect(user.role).toBe('staff');
    expect(user.backendRole).toBe('Loan Officer');
    expect(user.employeeId).toBe('LO-001');
  });

  it('keeps explicit staff portal role when refreshing profile fields', () => {
    const user = normalizeAuthUser(
      {
        id: 2,
        email: 'loanofficer1@gmail.com',
        fullName: 'Loan Officer',
        role: 'staff',
        backendRole: 'Loan Officer',
      },
      'staff'
    );

    expect(user.role).toBe('staff');
    expect(user.backendRole).toBe('Loan Officer');
  });
});
