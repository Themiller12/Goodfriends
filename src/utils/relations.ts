import {RelationType} from '../types';

export type RelationCategory = 'children' | 'family' | 'relations';

export const CATEGORY_TITLES: Record<RelationCategory, string> = {
  children: 'Enfants',
  family: 'Famille',
  relations: 'Relations',
};

export const RELATION_LABELS: Record<string, string> = {
  [RelationType.SPOUSE]: 'Conjoint(e)',
  [RelationType.CHILD]: 'Enfant',
  [RelationType.PARENT]: 'Parent',
  [RelationType.FATHER]: 'Père',
  [RelationType.MOTHER]: 'Mère',
  [RelationType.SIBLING]: 'Frère/Sœur',
  [RelationType.COUSIN]: 'Cousin(e)',
  [RelationType.STEPMOTHER]: 'Belle-mère',
  [RelationType.STEPFATHER]: 'Beau-père',
  [RelationType.GRANDPARENT]: 'Grand-parent',
  [RelationType.GRANDCHILD]: 'Petit-enfant',
  [RelationType.FRIEND]: 'Ami(e)',
  [RelationType.COLLEAGUE]: 'Collègue',
  [RelationType.OTHER]: 'Autre',
};

// Types proposés à la saisie (les liens grand-parent / petit-enfant sont calculés par le serveur)
export const SELECTABLE_TYPES: Record<RelationCategory, RelationType[]> = {
  children: [RelationType.CHILD],
  family: [
    RelationType.SIBLING,
    RelationType.SPOUSE,
    RelationType.FATHER,
    RelationType.MOTHER,
    RelationType.PARENT,
    RelationType.COUSIN,
    RelationType.STEPMOTHER,
    RelationType.STEPFATHER,
  ],
  relations: [RelationType.FRIEND, RelationType.COLLEAGUE, RelationType.OTHER],
};

export const DERIVED_TYPES: string[] = [RelationType.GRANDPARENT, RelationType.GRANDCHILD];

export const getRelationCategory = (type: string): RelationCategory => {
  if (type === RelationType.CHILD) {
    return 'children';
  }
  if (SELECTABLE_TYPES.relations.includes(type as RelationType)) {
    return 'relations';
  }
  return 'family';
};

export const getRelationLabel = (type: string, custom?: string): string =>
  custom || RELATION_LABELS[type] || 'Autre';
