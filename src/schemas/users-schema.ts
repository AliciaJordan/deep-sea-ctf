import { USERS_COLUMNS, type CollectionSchema } from 'deepspace/schema'

export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: USERS_COLUMNS.map((column) => column.name === 'role'
    ? { ...column, interpretation: { kind: 'select' as const, options: ['admin', 'player'] } }
    : column),
  permissions: {
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    player: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
  defaultRole: 'player',
}
