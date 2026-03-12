// Types de relations familiales
export enum RelationType {
  SPOUSE = 'spouse',
  CHILD = 'child',
  PARENT = 'parent',    // conservé pour compatibilité ascendante
  FATHER = 'father',
  MOTHER = 'mother',
  SIBLING = 'sibling',
  COUSIN = 'cousin',
  STEPMOTHER = 'stepmother',
  STEPFATHER = 'stepfather',
  FRIEND = 'friend',
  COLLEAGUE = 'colleague',
  OTHER = 'other',
}

// Type de groupe de contacts
export enum GroupType {
  FAMILY = 'family',
  FRIENDS = 'friends',
  WORK = 'work',
  OTHER = 'other',
}

// Relation entre deux contacts
export interface Relationship {
  id: string;
  contactId: string;
  relationType: RelationType;
  notes?: string;
  customRelationLabel?: string;  // Label libre (affiché à la place du type quand renseigné)
}

// Enfant (sans être un contact complet)
export interface Child {
  id: string;
  firstName: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  notes?: string;
}

// Profession ou étude
export interface ProfessionStudy {
  id: string;
  title: string; // Nom de la profession ou de l'étude
  year?: number; // Année de début ou obtention
  notes?: string;
}

// Contact
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  age?: number;
  photo?: string;
  gender?: 'male' | 'female' | 'other';
  allergies?: string;
  travels?: string[];
  profession?: string;
  notes?: string;
  relationships: Relationship[];
  children: Child[];
  professionsStudies: ProfessionStudy[];
  groupIds: string[];
  goodfriendsUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Groupe de contacts
export interface ContactGroup {
  id: string;
  name: string;
  type: GroupType;
  color?: string;
  description?: string;
  contactIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Profil utilisateur
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: Date;
  bio?: string;
  photo?: string;
  birthdayNotificationsEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Données de compte utilisateur
export interface UserAccount {
  id: string;
  email: string;
  password: string; // Hash du mot de passe
  profile: UserProfile;
  createdAt: Date;
  lastLogin?: Date;
  isVerified: boolean;
  verificationCode?: string;
}

// Position pour la visualisation graphique
export interface NodePosition {
  x: number;
  y: number;
}

// Nœud du graphe (contact avec position)
export interface GraphNode extends Contact {
  position?: NodePosition;
}

// Lien du graphe (connexion entre contacts)
export interface GraphLink {
  source: string; // Contact ID
  target: string; // Contact ID
  relationType: RelationType;
}
