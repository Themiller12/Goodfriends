# API Goodfriends - Documentation

## Configuration

1. Importez `database.sql` dans votre base de données MySQL
2. Modifiez les paramètres dans `api/config.php` :
   - DB_HOST
   - DB_NAME
   - DB_USER
   - DB_PASS
   - JWT_SECRET (important pour la sécurité)

## Endpoints disponibles

### Authentification (`auth.php`)

#### Inscription
```
POST /api/auth.php?action=register
Body: {
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
Response: {
  "success": true,
  "data": {
    "userId": "...",
    "verificationCode": "123456",
    "email": "user@example.com"
  }
}
```

#### Connexion
```
POST /api/auth.php?action=login
Body: {
  "email": "user@example.com",
  "password": "password123"
}
Response: {
  "success": true,
  "data": {
    "token": "eyJ...",
    "user": {...}
  }
}
```

#### Vérification du code
```
POST /api/auth.php?action=verify
Body: {
  "email": "user@example.com",
  "code": "123456"
}
```

#### Renvoyer le code
```
POST /api/auth.php?action=resend
Body: {
  "email": "user@example.com"
}
```

#### Obtenir le profil
```
GET /api/auth.php?action=profile
Headers: Authorization: Bearer <token>
```

#### Mettre à jour le profil
```
PUT /api/auth.php?action=profile
Headers: Authorization: Bearer <token>
Body: {
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+33612345678",
  "dateOfBirth": "1990-01-01",
  "bio": "Ma bio",
  "photo": "data:image/..."
}
```

### Contacts (`contacts.php`)

Toutes les requêtes nécessitent le header: `Authorization: Bearer <token>`

#### Récupérer tous les contacts
```
GET /api/contacts.php
```

#### Récupérer un contact
```
GET /api/contacts.php?id=contact_id
```

#### Créer un contact
```
POST /api/contacts.php
Body: {
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "+33612345678",
  "dateOfBirth": "1992-05-15",
  "age": 31,
  "notes": "Notes...",
  "photo": "data:image/...",
  "groupIds": ["group_id_1"]
}
```

#### Mettre à jour un contact
```
PUT /api/contacts.php
Body: {
  "id": "contact_id",
  "firstName": "Jane",
  ...
}
```

#### Supprimer un contact
```
DELETE /api/contacts.php?id=contact_id
```

### Groupes (`groups.php`)

#### Récupérer tous les groupes
```
GET /api/groups.php
Headers: Authorization: Bearer <token>
```

#### Créer un groupe
```
POST /api/groups.php
Headers: Authorization: Bearer <token>
Body: {
  "name": "Famille",
  "type": "family",
  "description": "Mon groupe famille"
}
```

#### Mettre à jour un groupe
```
PUT /api/groups.php
Headers: Authorization: Bearer <token>
Body: {
  "id": "group_id",
  "name": "Famille élargie",
  "type": "family"
}
```

#### Supprimer un groupe
```
DELETE /api/groups.php?id=group_id
Headers: Authorization: Bearer <token>
```

### Relations (`relationships.php`)

#### Ajouter un enfant
```
POST /api/relationships.php?action=child
Headers: Authorization: Bearer <token>
Body: {
  "contactId": "contact_id",
  "firstName": "Emma",
  "lastName": "Smith",
  "dateOfBirth": "2020-03-10",
  "gender": "female"
}
```

#### Supprimer un enfant
```
DELETE /api/relationships.php?action=child&id=child_id
Headers: Authorization: Bearer <token>
```

#### Ajouter une relation
```
POST /api/relationships.php?action=relationship
Headers: Authorization: Bearer <token>
Body: {
  "contactId": "contact_id_1",
  "relatedContactId": "contact_id_2",
  "relationType": "spouse"
}
```

#### Supprimer une relation
```
DELETE /api/relationships.php?action=relationship&contactId=id1&relatedContactId=id2
Headers: Authorization: Bearer <token>
```

## Types disponibles

### Relation Types
- `spouse` - Conjoint(e)
- `child` - Enfant
- `parent` - Parent
- `sibling` - Frère/Sœur
- `friend` - Ami(e)
- `colleague` - Collègue
- `other` - Autre

### Group Types
- `family` - Famille
- `friends` - Amis
- `work` - Travail
- `other` - Autre

## Sécurité

- Tous les mots de passe sont hashés avec `password_hash()`
- Les tokens JWT ont une durée de validité de 30 jours
- Les requêtes CORS sont autorisées (à configurer selon vos besoins)
- Changez `JWT_SECRET` en production

## Test avec curl

```bash
# Register
curl -X POST http://localhost/Goodfriends/api/auth.php?action=register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","firstName":"Test","lastName":"User"}'

# Login
curl -X POST http://localhost/Goodfriends/api/auth.php?action=login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'
```
