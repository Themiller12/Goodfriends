import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Modal from './AppModal';
import {useTheme} from '../context/ThemeContext';
import {Child, Contact, FamilyMemberInfo, Relationship, RelationType} from '../types';
import {
  CATEGORY_TITLES,
  DERIVED_TYPES,
  RelationCategory,
  SELECTABLE_TYPES,
  getRelationCategory,
  getRelationLabel,
} from '../utils/relations';

export interface RelationsValue {
  children: Child[];
  familyMembers: FamilyMemberInfo[];
  relationships: Relationship[];
}

interface RelationsEditorProps {
  value: RelationsValue;
  onChange: (value: RelationsValue) => void;
  allContacts: Contact[];
  excludeContactId?: string;
  onOpenContact?: (contactId: string) => void;
  onDetachChild?: (child: Child) => void;
}

type Gender = 'male' | 'female' | 'other';

interface FormState {
  category: RelationCategory;
  mode: 'linked' | 'free';
  editingId: string | null;
  // Les enfants "champ libre" sont stockés dans children[], les autres dans familyMembers[]
  editingKind: 'child' | 'member' | null;
}

const CATEGORIES: RelationCategory[] = ['children', 'family', 'relations'];

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const ageLabel = (date?: Date | string): string => {
  if (!date) {
    return '';
  }
  const birth = new Date(date);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) {
    return '';
  }
  if (years === 0) {
    return months <= 0 ? 'Nouveau-né' : `${months} mois`;
  }
  return `${years} an${years > 1 ? 's' : ''}`;
};

const RelationsEditor: React.FC<RelationsEditorProps> = ({
  value,
  onChange,
  allContacts,
  excludeContactId,
  onOpenContact,
  onDetachChild,
}) => {
  const {theme} = useTheme();
  const S = useMemo(() => styles(theme.primary), [theme.primary]);

  const [form, setForm] = useState<FormState | null>(null);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [relType, setRelType] = useState<RelationType>(RelationType.FRIEND);
  const [customLabel, setCustomLabel] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState<Date | undefined>(undefined);
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [gifts, setGifts] = useState<string[]>([]);
  const [giftInput, setGiftInput] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [contactQuery, setContactQuery] = useState('');

  const availableContacts = useMemo(() => {
    const linkedIds = new Set(value.relationships.map(r => r.contactId));
    const query = contactQuery.trim().toLowerCase();
    return allContacts.filter(c => {
      if (c.id === excludeContactId || linkedIds.has(c.id)) {
        return false;
      }
      return !query || `${c.firstName} ${c.lastName}`.toLowerCase().includes(query);
    });
  }, [allContacts, excludeContactId, value.relationships, contactQuery]);

  const closeForm = () => {
    setForm(null);
    setSelectedContactId('');
    setCustomLabel('');
    setFirstName('');
    setLastName('');
    setDob(undefined);
    setGender(undefined);
    setNotes('');
    setGifts([]);
    setGiftInput('');
    setShowDatePicker(false);
  };

  const openForm = (category: RelationCategory, mode: 'linked' | 'free') => {
    closeForm();
    setRelType(SELECTABLE_TYPES[category][0]);
    setForm({category, mode, editingId: null, editingKind: null});
  };

  const openChildEdit = (child: Child) => {
    closeForm();
    setFirstName(child.firstName);
    setDob(child.dateOfBirth ? new Date(child.dateOfBirth) : undefined);
    setGender(child.gender);
    setNotes(child.notes || '');
    setGifts(child.gifts ? [...child.gifts] : []);
    setForm({category: 'children', mode: 'free', editingId: child.id, editingKind: 'child'});
  };

  const openMemberEdit = (member: FamilyMemberInfo) => {
    closeForm();
    setFirstName(member.firstName);
    setLastName(member.lastName || '');
    setDob(member.dateOfBirth ? new Date(member.dateOfBirth) : undefined);
    setGender(member.gender);
    setNotes(member.notes || '');
    setRelType(member.relationType);
    setForm({
      category: getRelationCategory(member.relationType),
      mode: 'free',
      editingId: member.id,
      editingKind: 'member',
    });
  };

  const confirmDelete = (title: string, onConfirm: () => void) => {
    Alert.alert(title, 'Cette action est irréversible une fois le contact enregistré.', [
      {text: 'Annuler', style: 'cancel'},
      {text: 'Supprimer', style: 'destructive', onPress: onConfirm},
    ]);
  };

  const saveLinked = () => {
    if (!form) {
      return;
    }
    if (!selectedContactId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un contact');
      return;
    }
    const type = form.category === 'children' ? RelationType.CHILD : relType;
    const relationship: Relationship = {
      id: newId('rel'),
      contactId: selectedContactId,
      relationType: type,
      customRelationLabel:
        type === RelationType.OTHER && customLabel.trim() ? customLabel.trim() : undefined,
    };
    onChange({...value, relationships: [...value.relationships, relationship]});
    closeForm();
  };

  const saveFree = () => {
    if (!form) {
      return;
    }
    const name = firstName.trim();
    if (!name) {
      Alert.alert('Erreur', 'Le prénom est obligatoire');
      return;
    }

    if (form.category === 'children' && form.editingKind !== 'member') {
      const child: Child = {
        id: form.editingId || newId('child'),
        firstName: name,
        dateOfBirth: dob,
        gender,
        notes: notes.trim() || undefined,
        gifts: gifts.length > 0 ? [...gifts] : undefined,
      };
      const children = form.editingId
        ? value.children.map(c => (c.id === child.id ? child : c))
        : [...value.children, child];
      onChange({...value, children});
    } else {
      const member: FamilyMemberInfo = {
        id: form.editingId || newId('fm'),
        firstName: name,
        lastName: lastName.trim() || undefined,
        dateOfBirth: dob ? dob.toISOString() : undefined,
        gender,
        relationType: form.category === 'children' ? RelationType.CHILD : relType,
        notes: notes.trim() || undefined,
      };
      const familyMembers = form.editingId
        ? value.familyMembers.map(m => (m.id === member.id ? member : m))
        : [...value.familyMembers, member];
      onChange({...value, familyMembers});
    }
    closeForm();
  };

  const renderLinked = (relationship: Relationship) => {
    const linked = allContacts.find(c => c.id === relationship.contactId);
    const derived = DERIVED_TYPES.includes(relationship.relationType);
    return (
      <View key={`rel-${relationship.contactId}`} style={S.card}>
        <TouchableOpacity
          style={S.cardInfo}
          disabled={!linked || !onOpenContact}
          onPress={() => linked && onOpenContact && onOpenContact(linked.id)}>
          <Text style={S.cardLabel}>
            {getRelationLabel(relationship.relationType, relationship.customRelationLabel)}
          </Text>
          <Text style={S.cardName}>
            {linked ? `${linked.firstName} ${linked.lastName}` : 'Contact inconnu'}
          </Text>
          {derived && <Text style={S.cardDetail}>Déduit automatiquement de la famille</Text>}
        </TouchableOpacity>
        {!derived && (
          <TouchableOpacity
            style={S.iconButton}
            onPress={() =>
              confirmDelete('Supprimer la relation', () =>
                onChange({
                  ...value,
                  relationships: value.relationships.filter(r => r.contactId !== relationship.contactId),
                }),
              )
            }>
            <MaterialIcons name="close" size={20} color="#f44336" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderChild = (child: Child) => {
    const age = ageLabel(child.dateOfBirth);
    return (
      <View key={`child-${child.id}`} style={S.card}>
        <View style={S.cardInfo}>
          <Text style={S.cardLabel}>Enfant · sans compte lié</Text>
          <Text style={S.cardName}>
            {child.firstName}
            {age ? ` (${age})` : ''}
          </Text>
          {!!child.dateOfBirth && (
            <Text style={S.cardDetail}>Né(e) le {new Date(child.dateOfBirth).toLocaleDateString('fr-FR')}</Text>
          )}
          {!!child.notes && <Text style={S.cardDetail}>{child.notes}</Text>}
          {!!child.gifts && child.gifts.length > 0 && (
            <Text style={S.cardDetail}>Cadeaux : {child.gifts.join(', ')}</Text>
          )}
        </View>
        <TouchableOpacity style={S.iconButton} onPress={() => openChildEdit(child)}>
          <MaterialIcons name="edit" size={18} color={theme.primary} />
        </TouchableOpacity>
        {onDetachChild && (
          <TouchableOpacity style={S.iconButton} onPress={() => onDetachChild(child)}>
            <MaterialIcons name="person-add" size={18} color={theme.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={S.iconButton}
          onPress={() =>
            confirmDelete("Supprimer l'enfant", () =>
              onChange({...value, children: value.children.filter(c => c.id !== child.id)}),
            )
          }>
          <MaterialIcons name="close" size={20} color="#f44336" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderMember = (member: FamilyMemberInfo) => {
    const age = ageLabel(member.dateOfBirth);
    return (
      <View key={`fm-${member.id}`} style={S.card}>
        <View style={S.cardInfo}>
          <Text style={S.cardLabel}>{getRelationLabel(member.relationType)} · sans compte lié</Text>
          <Text style={S.cardName}>
            {member.firstName}
            {member.lastName ? ` ${member.lastName}` : ''}
            {age ? ` (${age})` : ''}
          </Text>
          {!!member.notes && <Text style={S.cardDetail}>{member.notes}</Text>}
        </View>
        <TouchableOpacity style={S.iconButton} onPress={() => openMemberEdit(member)}>
          <MaterialIcons name="edit" size={18} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={S.iconButton}
          onPress={() =>
            confirmDelete('Supprimer la relation', () =>
              onChange({...value, familyMembers: value.familyMembers.filter(m => m.id !== member.id)}),
            )
          }>
          <MaterialIcons name="close" size={20} color="#f44336" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderForm = (category: RelationCategory) => {
    if (!form || form.category !== category) {
      return null;
    }

    if (form.mode === 'linked') {
      const selected = allContacts.find(c => c.id === selectedContactId);
      return (
        <View style={S.form}>
          <Text style={S.formTitle}>Lier un contact Goodfriends</Text>

          <Text style={S.formLabel}>Contact *</Text>
          <TouchableOpacity style={S.selector} onPress={() => setShowContactPicker(true)}>
            <Text style={S.selectorText}>
              {selected ? `${selected.firstName} ${selected.lastName}` : 'Sélectionner un contact'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#555" />
          </TouchableOpacity>

          {category !== 'children' && (
            <>
              <Text style={S.formLabel}>Type de relation *</Text>
              <TouchableOpacity style={S.selector} onPress={() => setShowTypePicker(true)}>
                <Text style={S.selectorText}>{getRelationLabel(relType)}</Text>
                <MaterialIcons name="arrow-drop-down" size={22} color="#555" />
              </TouchableOpacity>
            </>
          )}

          {category === 'relations' && relType === RelationType.OTHER && (
            <>
              <Text style={S.formLabel}>Label personnalisé</Text>
              <TextInput
                style={S.input}
                placeholder="Ex: Parrain, Voisin..."
                placeholderTextColor="#999"
                value={customLabel}
                onChangeText={setCustomLabel}
              />
            </>
          )}

          <View style={S.formButtons}>
            <TouchableOpacity style={S.saveButton} onPress={saveLinked}>
              <Text style={S.saveButtonText}>Ajouter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.cancelButton} onPress={closeForm}>
              <Text style={S.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const editing = !!form.editingId;
    const withDetails = category !== 'relations';
    return (
      <View style={S.form}>
        <Text style={S.formTitle}>
          {editing ? 'Modifier' : 'Ajouter'} {category === 'children' ? 'un enfant' : 'une personne'} (sans compte)
        </Text>

        <Text style={S.formLabel}>Prénom *</Text>
        <TextInput
          style={S.input}
          placeholder="Prénom"
          placeholderTextColor="#999"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        {(category !== 'children' || form.editingKind === 'member') && (
          <>
            <Text style={S.formLabel}>Nom</Text>
            <TextInput
              style={S.input}
              placeholder="Nom (optionnel)"
              placeholderTextColor="#999"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </>
        )}

        {category !== 'children' && (
          <>
            <Text style={S.formLabel}>Type de relation *</Text>
            <TouchableOpacity style={S.selector} onPress={() => setShowTypePicker(true)}>
              <Text style={S.selectorText}>{getRelationLabel(relType)}</Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#555" />
            </TouchableOpacity>
          </>
        )}

        {withDetails && (
          <>
            <Text style={S.formLabel}>Date de naissance</Text>
            <TouchableOpacity style={S.selector} onPress={() => setShowDatePicker(true)}>
              <Text style={S.selectorText}>
                {dob ? dob.toLocaleDateString('fr-FR') : 'Sélectionner une date'}
              </Text>
              <MaterialIcons name="calendar-today" size={18} color="#555" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dob || new Date()}
                mode="date"
                display="default"
                minimumDate={new Date(1900, 0, 1)}
                maximumDate={new Date()}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setDob(date);
                  }
                }}
              />
            )}

            <Text style={S.formLabel}>Sexe</Text>
            <View style={S.genderRow}>
              {(['male', 'female', 'other'] as const).map(g => (
                <TouchableOpacity
                  key={g}
                  style={[S.genderButton, gender === g && {backgroundColor: theme.primary, borderColor: theme.primary}]}
                  onPress={() => setGender(gender === g ? undefined : g)}>
                  <Text style={[S.genderText, gender === g && {color: '#fff'}]}>
                    {g === 'male' ? 'Masculin' : g === 'female' ? 'Féminin' : 'Autre'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={S.formLabel}>Notes</Text>
        <TextInput
          style={[S.input, S.textArea]}
          placeholder="Notes..."
          placeholderTextColor="#999"
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
        />

        {category === 'children' && form.editingKind !== 'member' && (
          <>
            <Text style={S.formLabel}>Cadeaux offerts</Text>
            {gifts.map((gift, idx) => (
              <View key={`${gift}-${idx}`} style={S.giftRow}>
                <Text style={S.giftText}>{gift}</Text>
                <TouchableOpacity onPress={() => setGifts(gifts.filter((_, i) => i !== idx))}>
                  <MaterialIcons name="close" size={18} color="#e53935" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={S.giftInputRow}>
              <TextInput
                style={[S.input, {flex: 1}]}
                placeholder="Ex: Lego, livre..."
                placeholderTextColor="#999"
                value={giftInput}
                onChangeText={setGiftInput}
              />
              <TouchableOpacity
                style={[S.giftAddButton, {backgroundColor: theme.primary}]}
                onPress={() => {
                  if (giftInput.trim()) {
                    setGifts([...gifts, giftInput.trim()]);
                    setGiftInput('');
                  }
                }}>
                <MaterialIcons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={S.formButtons}>
          <TouchableOpacity style={S.saveButton} onPress={saveFree}>
            <Text style={S.saveButtonText}>{editing ? 'Modifier' : 'Ajouter'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.cancelButton} onPress={closeForm}>
            <Text style={S.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCategory = (category: RelationCategory) => {
    const linked = value.relationships.filter(r => getRelationCategory(r.relationType) === category);
    const members = value.familyMembers.filter(m => getRelationCategory(m.relationType) === category);
    const children = category === 'children' ? value.children : [];
    const isEmpty = linked.length + members.length + children.length === 0;

    return (
      <View key={category} style={S.section}>
        <Text style={S.sectionTitle}>{CATEGORY_TITLES[category]}</Text>

        {isEmpty && !(form && form.category === category) && (
          <Text style={S.emptyText}>Aucun élément</Text>
        )}

        {children.map(renderChild)}
        {linked.map(renderLinked)}
        {members.map(renderMember)}

        {renderForm(category)}

        {!(form && form.category === category) && (
          <View style={S.addRow}>
            <TouchableOpacity
              style={[S.addButton, S.addButtonPrimary, {backgroundColor: theme.primary}]}
              activeOpacity={0.85}
              onPress={() => openForm(category, 'free')}>
              <MaterialIcons name="person-add" size={18} color="#FFF" />
              <Text style={[S.addButtonText, {color: '#FFF'}]}>Ajouter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.addButton, {borderColor: theme.primary, backgroundColor: theme.primary + '14'}]}
              activeOpacity={0.85}
              onPress={() => openForm(category, 'linked')}>
              <MaterialIcons name="group" size={18} color={theme.primary} />
              <Text style={[S.addButtonText, {color: theme.primary}]}>Contact GoodFriends</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const typeOptions = form ? SELECTABLE_TYPES[form.category] : [];

  return (
    <View>
      {CATEGORIES.map(renderCategory)}

      <Modal
        animationType="slide"
        transparent
        statusBarTranslucent
        visible={showContactPicker}
        onRequestClose={() => setShowContactPicker(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalContainer}>
            <Text style={S.modalTitle}>Sélectionner un contact</Text>
            <TextInput
              style={[S.input, {marginBottom: 8}]}
              placeholder="Rechercher..."
              placeholderTextColor="#999"
              value={contactQuery}
              onChangeText={setContactQuery}
            />
            <ScrollView style={{maxHeight: 280}} keyboardShouldPersistTaps="handled">
              {availableContacts.length === 0 && <Text style={S.emptyText}>Aucun contact disponible</Text>}
              {availableContacts.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[S.option, selectedContactId === c.id && {backgroundColor: theme.primary + '22'}]}
                  onPress={() => {
                    setSelectedContactId(c.id);
                    setContactQuery('');
                    setShowContactPicker(false);
                  }}>
                  <Text style={S.optionText}>
                    {c.firstName} {c.lastName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={S.modalClose}
              onPress={() => {
                setContactQuery('');
                setShowContactPicker(false);
              }}>
              <Text style={S.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        statusBarTranslucent
        visible={showTypePicker}
        onRequestClose={() => setShowTypePicker(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalContainer}>
            <Text style={S.modalTitle}>Type de relation</Text>
            <ScrollView style={{maxHeight: 320}}>
              {typeOptions.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[S.option, relType === type && {backgroundColor: theme.primary + '22'}]}
                  onPress={() => {
                    setRelType(type);
                    setShowTypePicker(false);
                  }}>
                  <Text style={S.optionText}>{getRelationLabel(type)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={S.modalClose} onPress={() => setShowTypePicker(false)}>
              <Text style={S.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = (primary: string) =>
  StyleSheet.create({
    section: {
      marginTop: 20,
      padding: 15,
      backgroundColor: '#fff',
      borderRadius: 10,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 10,
    },
    emptyText: {
      fontSize: 14,
      color: '#999',
      fontStyle: 'italic',
      marginBottom: 8,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f9f9f9',
      padding: 12,
      borderRadius: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#e0e0e0',
    },
    cardInfo: {flex: 1},
    cardLabel: {
      fontSize: 12,
      color: primary,
      fontWeight: '600',
      marginBottom: 2,
    },
    cardName: {
      fontSize: 16,
      color: '#333',
      fontWeight: '500',
    },
    cardDetail: {
      fontSize: 13,
      color: '#666',
      marginTop: 2,
    },
    iconButton: {padding: 6},
    addRow: {flexDirection: 'row', gap: 10, marginTop: 6},
    addButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    addButtonPrimary: {
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.15,
      shadowRadius: 2,
    },
    addButtonText: {fontSize: 14, fontWeight: '700', marginLeft: 6},
    form: {
      backgroundColor: '#f5f5f5',
      padding: 15,
      borderRadius: 10,
      marginTop: 6,
      borderWidth: 1,
      borderColor: '#ddd',
    },
    formTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 8,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: '#666',
      marginBottom: 5,
      marginTop: 10,
    },
    input: {
      backgroundColor: '#fff',
      padding: 12,
      borderRadius: 8,
      fontSize: 15,
      borderWidth: 1,
      borderColor: '#ddd',
      color: '#333',
    },
    textArea: {minHeight: 70},
    selector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    selectorText: {flex: 1, fontSize: 15, color: '#333'},
    genderRow: {flexDirection: 'row', gap: 8},
    genderButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#ddd',
      backgroundColor: '#fff',
    },
    genderText: {fontSize: 14, color: '#555'},
    giftRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: '#fff',
      borderRadius: 6,
      marginBottom: 4,
    },
    giftText: {flex: 1, fontSize: 14, color: '#333'},
    giftInputRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
    giftAddButton: {
      width: 42,
      height: 42,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formButtons: {flexDirection: 'row', gap: 10, marginTop: 15},
    saveButton: {
      flex: 1,
      backgroundColor: primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    saveButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
    cancelButton: {
      flex: 1,
      backgroundColor: '#e0e0e0',
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    cancelButtonText: {color: '#666', fontSize: 16, fontWeight: '600'},
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContainer: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 25,
      width: '100%',
      maxWidth: 400,
      elevation: 8,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 16,
      textAlign: 'center',
    },
    option: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    optionText: {fontSize: 15, color: '#333'},
    modalClose: {
      backgroundColor: '#f5f5f5',
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 10,
    },
  });

export default RelationsEditor;
