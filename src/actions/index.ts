import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { adminListChallenges, createChallenge, isOwnerAction, setPublished, updateChallengeFlag } from './admin-challenges'
import {
  createCommunityChallenge,
  deleteRejectedChallenge,
  myChallengeSubmissions,
  reviewCommunityChallenge,
} from './community-challenges'
import { getChallenge, listChallenges, submitFlag } from './submit-flag'

export const actions: Record<string, ActionHandler<Env>> = {
  adminListChallenges,
  createChallenge,
  createCommunityChallenge,
  deleteRejectedChallenge,
  getChallenge,
  isOwner: isOwnerAction,
  listChallenges,
  myChallengeSubmissions,
  reviewCommunityChallenge,
  setPublished,
  submitFlag,
  updateChallengeFlag,
}
