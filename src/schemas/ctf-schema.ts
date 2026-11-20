import type { CollectionSchema } from 'deepspace/schema'

const closed = { read: false, create: false, update: false, delete: false } as const

export const challengesSchema: CollectionSchema = {
  name: 'challenges',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'category', storage: 'text', interpretation: 'plain', required: true },
    { name: 'difficulty', storage: 'number', interpretation: 'plain', required: true },
    { name: 'points', storage: 'number', interpretation: 'plain', required: true },
    { name: 'description', storage: 'text', interpretation: 'plain', required: true },
    { name: 'releaseAt', storage: 'text', interpretation: 'datetime', required: true },
    { name: 'published', storage: 'number', interpretation: { kind: 'boolean' }, required: true },
  ],
  permissions: {
    viewer: closed,
    player: closed,
    admin: { read: true, create: false, update: false, delete: false },
  },
}

export const challengeSecretsSchema: CollectionSchema = {
  name: 'challengeSecrets',
  columns: [
    { name: 'challengeId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'flagMac', storage: 'text', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['challengeId'],
  permissions: { viewer: closed, player: closed, admin: closed },
}

export const submissionsSchema: CollectionSchema = {
  name: 'submissions',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, required: true },
    { name: 'challengeId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'correct', storage: 'number', interpretation: { kind: 'boolean' }, required: true },
    { name: 'ts', storage: 'text', interpretation: 'datetime', required: true },
  ],
  ownerField: 'userId',
  permissions: {
    viewer: closed,
    player: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}

// A private, unique slot claim makes the per-user/per-challenge attempt limit
// safe when several submissions arrive at once. The minute bucket bounds the
// uniqueness key; timestamps let the action enforce a rolling 60-second window.
export const attemptClaimsSchema: CollectionSchema = {
  name: 'attemptClaims',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, required: true },
    { name: 'challengeId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'bucket', storage: 'number', interpretation: 'plain', required: true },
    { name: 'slot', storage: 'number', interpretation: 'plain', required: true },
    { name: 'ts', storage: 'text', interpretation: 'datetime', required: true },
  ],
  uniqueOn: ['userId', 'challengeId', 'bucket', 'slot'],
  ownerField: 'userId',
  permissions: { viewer: closed, player: closed, admin: closed },
}

export const solvesSchema: CollectionSchema = {
  name: 'solves',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, required: true },
    { name: 'challengeId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'points', storage: 'number', interpretation: 'plain', required: true },
    { name: 'solvedAt', storage: 'text', interpretation: 'datetime', required: true },
    { name: 'firstSolve', storage: 'number', interpretation: { kind: 'boolean' }, required: true },
  ],
  uniqueOn: ['userId', 'challengeId'],
  ownerField: 'userId',
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    player: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: false },
  },
}
