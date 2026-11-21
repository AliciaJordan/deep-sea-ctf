/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import {
  attachmentUploadClaimsSchema,
  attemptClaimsSchema,
  challengeAttachmentsSchema,
  challengesSchema,
  challengeSecretsSchema,
  submissionsSchema,
  solvesSchema,
} from './schemas/ctf-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  challengesSchema,
  challengeSecretsSchema,
  attemptClaimsSchema,
  challengeAttachmentsSchema,
  attachmentUploadClaimsSchema,
  submissionsSchema,
  solvesSchema,
]
