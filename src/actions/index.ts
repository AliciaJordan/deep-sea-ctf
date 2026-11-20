import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { adminListChallenges, createChallenge, isOwnerAction, seedStarterChallenges, setPublished } from './admin-challenges'
import { listChallenges, submitFlag } from './submit-flag'

export const actions: Record<string, ActionHandler<Env>> = {
  adminListChallenges, createChallenge, isOwner: isOwnerAction, listChallenges, seedStarterChallenges, setPublished, submitFlag,
}
