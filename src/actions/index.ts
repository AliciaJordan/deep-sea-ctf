import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { listChallenges, seedSampleChallenges, submitFlag } from './submit-flag'

export const actions: Record<string, ActionHandler<Env>> = { listChallenges, seedSampleChallenges, submitFlag }
