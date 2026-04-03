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

// Membre de la famille sans compte Goodfriends (frère, sœur, parent...)
export interface FamilyMemberInfo {
  id: string;
  firstName: string;
  lastName?: string;
  dateOfBirth?: string; // ISO string
  gender?: 'male' | 'female' | 'other';
  relationType: RelationType; // Relation vis-à-vis du contact (ex: SIBLING)
  notes?: string;
}

// Enfant (sans être un contact complet)
export interface Child {
  id: string;
  firstName: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  notes?: string;
  gifts?: string[]; // Liste des cadeaux offerts
}

// Profession ou étude
export interface ProfessionStudy {
  id: string;
  title: string; // Nom de la profession ou de l'étude
  year?: number; // Année de début ou obtention
  notes?: string;
}

// Note libre sur un contact (une par entrée, stocké localement)
export interface NoteEntry {
  id: string;
  text: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
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
  familyMembers?: FamilyMemberInfo[]; // membres famille sans compte Goodfriends
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt?: Date; // Date du dernier vrai contact (appel, message GF, action manuelle)
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

// Réaction sur un message de groupe
export interface GroupMessageReaction {
  userId: string;
  emoji: string; // clé de réaction : 'love'|'like'|'dislike'|'wow'|'angry'
}

// Message local dans un groupe de conversation
export interface GroupMessage {
  id: string;
  senderId: string; // 'me' ou goodfriendsUserId d'un membre
  senderName: string;
  text: string;
  imageBase64?: string; // image en base64
  imageMime?: string;   // ex: 'image/jpeg'
  replyToId?: string;
  replyToText?: string;
  replyToSenderName?: string;
  reactions?: GroupMessageReaction[];
  createdAt: string; // ISO date string
}

// Membre d'un groupe de conversation
export interface GroupMember {
  userId: string; // goodfriendsUserId (peut être vide si contact local seulement)
  contactId: string; // id du Contact local
  firstName: string;
  lastName: string;
  photo?: string;
}

// Groupe de conversation (stocké localement)
export interface GroupChat {
  id: string;
  name: string;
  members: GroupMember[];
  messages: GroupMessage[];
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
