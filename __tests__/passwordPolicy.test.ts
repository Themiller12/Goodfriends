import {getPasswordError} from '../src/utils/passwordPolicy';

describe('getPasswordError', () => {
  it('accepte un mot de passe conforme', () => {
    expect(getPasswordError('Abcdef1!')).toBeNull();
    expect(getPasswordError('Mot2passe é!')).toBeNull();
  });

  it('refuse un mot de passe trop court', () => {
    expect(getPasswordError('Ab1!')).toMatch(/8 caractères/);
  });

  it('refuse un mot de passe trop long (limite bcrypt)', () => {
    expect(getPasswordError('Ab1!' + 'a'.repeat(70))).toMatch(/72/);
  });

  it('exige une lettre, un chiffre et un caractère spécial', () => {
    expect(getPasswordError('12345678!')).toMatch(/lettre/);
    expect(getPasswordError('abcdefgh!')).toMatch(/chiffre/);
    expect(getPasswordError('abcdefgh1')).toMatch(/spécial/);
  });
});
