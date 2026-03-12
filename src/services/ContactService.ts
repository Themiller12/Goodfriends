import {Contact, ContactGroup, Relationship, RelationType} from '../types';
import StorageService from './StorageService';
import StorageServiceAPI from './StorageServiceAPI';

class ContactService {
  // Générer un ID unique
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Calculer l'âge à partir de la date de naissance
  calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    
    return age;
  }

  // Calculer l'âge avec détail (jours/mois pour les moins d'un an)
  private calculateDetailedAge(birthDate: Date): string {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    // Si moins d'un an, afficher en mois
    if (age < 1) {
      let months = monthDiff;
      if (today.getDate() < birth.getDate()) {
        months--;
      }
      if (months < 0) {
        months += 12;
      }
      
      if (months === 0) {
        // Calculer en jours pour les très jeunes bébés
        const diffTime = Math.abs(today.getTime() - birth.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
          return 'aujourd\'hui';
        } else if (diffDays === 1) {
          return '1 jour';
        } else if (diffDays < 31) {
          return `${diffDays} jours`;
        }
      }
      
      return months === 1 ? '1 mois' : `${months} mois`;
    }
    
    return age >= 0 ? `${age} ans` : '';
  }

  // Créer un nouveau contact
  async createContact(contactData: Partial<Contact>): Promise<Contact> {
    const contact: Contact = {
      id: this.generateId(),
      firstName: contactData.firstName || '',
      lastName: contactData.lastName || '',
      email: contactData.email,
      phone: contactData.phone,
      dateOfBirth: contactData.dateOfBirth,
      age: contactData.dateOfBirth
        ? this.calculateAge(contactData.dateOfBirth)
        : contactData.age,
      photo: contactData.photo,
      notes: contactData.notes,
      relationships: [],
      children: [],
      professionsStudies: contactData.professionsStudies || [],
      groupIds: contactData.groupIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await StorageService.addContact(contact);
    
    // Ajouter le contact aux groupes sélectionnés
    if (contact.groupIds && contact.groupIds.length > 0) {
      const groups = await StorageService.getGroups();
      for (const groupId of contact.groupIds) {
        const group = groups.find(g => g.id === groupId);
        if (group && !group.contactIds.includes(contact.id)) {
          group.contactIds.push(contact.id);
          group.updatedAt = new Date();
          await StorageService.updateGroup(group);
        }
      }
    }
    
    return contact;
  }

  // Ajouter un enfant à un contact
  async addChild(
    contactId: string,
    childData: { firstName: string; dateOfBirth?: Date; notes?: string }
  ): Promise<void> {
    // Utiliser l'API pour créer l'enfant
    await StorageServiceAPI.addChild(contactId, childData);
  }

  // Ajouter une relation entre deux contacts
  async addRelationship(
    contactId: string,
    relatedContactId: string,
    relationType: RelationType,
    notes?: string,
    customRelationLabel?: string,
  ): Promise<void> {
    // Utiliser l'API pour créer la relation
    await StorageServiceAPI.addRelationship(contactId, relatedContactId, relationType, notes, customRelationLabel);
  }

  // Obtenir le type de relation inverse
  private getInverseRelationType(relationType: RelationType): RelationType {
    switch (relationType) {
      case RelationType.SPOUSE:
        return RelationType.SPOUSE; // Conjoint est réciproque
      case RelationType.PARENT:
        return RelationType.CHILD; // Si A est parent de B, alors B est enfant de A
      case RelationType.CHILD:
        return RelationType.PARENT; // Si A est enfant de B, alors B est parent de A
      case RelationType.SIBLING:
        return RelationType.SIBLING; // Frère/Sœur est réciproque
      case RelationType.FRIEND:
        return RelationType.FRIEND; // Ami est réciproque
      case RelationType.COLLEAGUE:
        return RelationType.COLLEAGUE; // Collègue est réciproque
      default:
        return RelationType.OTHER; // Autre reste autre
    }
  }

  // Obtenir les informations synthétisées d'un contact
  async getContactSummary(contactId: string): Promise<string> {
    const contacts = await StorageService.getContacts();
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
      return 'Contact non trouvé';
    }

    const age = contact.age ||
      (contact.dateOfBirth ? this.calculateAge(contact.dateOfBirth) : null);
    
    let summary = `${contact.firstName} ${contact.lastName}`;
    
    if (age) {
      summary += ` a ${age} ans`;
    }

    // Afficher les enfants (non-contacts) avec âge
    if (contact.children && contact.children.length > 0) {
      summary += ` et ${contact.children.length} enfant${contact.children.length > 1 ? 's' : ''}`;
      const childNames = contact.children.map(c => {
        const childAge = c.dateOfBirth ? this.calculateDetailedAge(c.dateOfBirth) : null;
        return childAge !== null ? `${c.firstName} (${childAge})` : c.firstName;
      }).join(' et ');
      summary += ` : ${childNames}`;
    }

    // Trouver les enfants parmi les contacts liés avec âge
    const childContacts = contact.relationships
      .filter(r => r.relationType === RelationType.CHILD)
      .map(r => contacts.find(c => c.id === r.contactId))
      .filter(c => c !== undefined);

    if (childContacts.length > 0) {
      if (!contact.children || contact.children.length === 0) {
        summary += ` et ${childContacts.length} enfant${childContacts.length > 1 ? 's' : ''}`;
      } else {
        summary += ` (et ${childContacts.length} autre${childContacts.length > 1 ? 's' : ''})`;
      }
      const childNames = childContacts.map(c => {
        const childAge = c!.dateOfBirth ? this.calculateDetailedAge(c!.dateOfBirth) : (c!.age ? `${c!.age} ans` : null);
        return childAge !== null ? `${c!.firstName} (${childAge})` : c!.firstName;
      }).join(' et ');
      summary += ` : ${childNames}`;
    }

    // Trouver le conjoint
    const spouse = contact.relationships
      .find(r => r.relationType === RelationType.SPOUSE);
    
    if (spouse) {
      const spouseContact = contacts.find(c => c.id === spouse.contactId);
      if (spouseContact) {
        summary += `. Son conjoint s'appelle ${spouseContact.firstName}`;
      }
    }

    // Ajouter les notes
    if (contact.notes) {
      summary += `.\n\nNote :\n${contact.notes}`;
    }

    return summary;
  }

  // Obtenir tous les contacts d'un groupe
  async getContactsByGroup(groupId: string): Promise<Contact[]> {
    const contacts = await StorageService.getContacts();
    return contacts.filter(c => c.groupIds && c.groupIds.includes(groupId));
  }

  // Obtenir les relations d'un contact
  async getContactRelationships(contactId: string): Promise<Contact[]> {
    const contacts = await StorageService.getContacts();
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
      return [];
    }

    return contact.relationships
      .map(r => contacts.find(c => c.id === r.contactId))
      .filter(c => c !== undefined) as Contact[];
  }

  // Créer un groupe
  async createGroup(groupData: Partial<ContactGroup>): Promise<ContactGroup> {
    const group: ContactGroup = {
      id: this.generateId(),
      name: groupData.name || '',
      type: groupData.type!,
      color: groupData.color,
      description: groupData.description,
      contactIds: groupData.contactIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await StorageService.addGroup(group);
    return group;
  }

  // Ajouter un contact à un groupe
  async addContactToGroup(contactId: string, groupId: string): Promise<void> {
    const contacts = await StorageService.getContacts();
    const groups = await StorageService.getGroups();
    
    const contact = contacts.find(c => c.id === contactId);
    const group = groups.find(g => g.id === groupId);
    
    if (!contact || !group) {
      throw new Error('Contact ou groupe non trouvé');
    }

    if (!contact.groupIds) {
      contact.groupIds = [];
    }
    if (!contact.groupIds.includes(groupId)) {
      contact.groupIds.push(groupId);
      contact.updatedAt = new Date();
      await StorageService.updateContact(contact);
    }

    if (!group.contactIds.includes(contactId)) {
      group.contactIds.push(contactId);
      group.updatedAt = new Date();
      await StorageService.updateGroup(group);
    }
  }

  // Retirer un contact d'un groupe
  async removeContactFromGroup(
    contactId: string,
    groupId: string,
  ): Promise<void> {
    const contacts = await StorageService.getContacts();
    const groups = await StorageService.getGroups();
    
    const contact = contacts.find(c => c.id === contactId);
    const group = groups.find(g => g.id === groupId);
    
    if (!contact || !group) {
      throw new Error('Contact ou groupe non trouvé');
    }

    contact.groupIds = (contact.groupIds || []).filter(id => id !== groupId);
    contact.updatedAt = new Date();
    await StorageService.updateContact(contact);

    group.contactIds = group.contactIds.filter(id => id !== contactId);
    group.updatedAt = new Date();
    await StorageService.updateGroup(group);
  }
}

export default new ContactService();
