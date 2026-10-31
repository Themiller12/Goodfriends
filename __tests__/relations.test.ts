import {RelationType} from '../src/types';
import {
  SELECTABLE_TYPES,
  getRelationCategory,
  getRelationLabel,
} from '../src/utils/relations';

describe('getRelationCategory', () => {
  it('classe les types dans Enfants, Famille ou Relations', () => {
    expect(getRelationCategory(RelationType.CHILD)).toBe('children');
    expect(getRelationCategory(RelationType.SIBLING)).toBe('family');
    expect(getRelationCategory(RelationType.GRANDPARENT)).toBe('family');
    expect(getRelationCategory(RelationType.FRIEND)).toBe('relations');
    expect(getRelationCategory(RelationType.OTHER)).toBe('relations');
  });

  it('ne propose pas à la saisie les liens déduits par le serveur', () => {
    const selectable = Object.values(SELECTABLE_TYPES).flat();
    expect(selectable).not.toContain(RelationType.GRANDPARENT);
    expect(selectable).not.toContain(RelationType.GRANDCHILD);
  });
});

describe('getRelationLabel', () => {
  it('privilégie le label personnalisé', () => {
    expect(getRelationLabel(RelationType.OTHER, 'Parrain')).toBe('Parrain');
  });

  it('retourne le libellé français du type', () => {
    expect(getRelationLabel(RelationType.GRANDCHILD)).toBe('Petit-enfant');
  });
});
