import { describe, expect, it } from 'vitest'
import { parseCommunityChallengeDraft } from './community-challenges'

const sampleFlag = ['ocean', '{', 'x'.repeat(8), '}'].join('')
const draft = {
  title: '  Lost Signal  ',
  category: ' FORENSICS ',
  difficulty: 2,
  description: 'Inspect the recovered transmission.',
  flag: ` ${sampleFlag} `,
  writeup: 'Decode the payload, then verify the recovered signal.',
}

describe('parseCommunityChallengeDraft', () => {
  it('trims fields and returns a validated challenge draft', () => {
    expect(parseCommunityChallengeDraft(draft)).toEqual({
      success: true,
      data: {
        ...draft,
        title: 'Lost Signal',
        category: 'FORENSICS',
        flag: sampleFlag,
      },
    })
  })

  it('rejects malformed flags and invalid depth values', () => {
    expect(parseCommunityChallengeDraft({ ...draft, flag: 'not-a-flag' })).toMatchObject({
      success: false,
      error: 'Flag must use ocean{...} with 8 to 256 non-space characters inside.',
    })
    expect(parseCommunityChallengeDraft({ ...draft, difficulty: 5 })).toMatchObject({
      success: false,
      error: 'Depth must be between 1 and 4.',
    })
  })

  it('requires a solution write-up', () => {
    expect(parseCommunityChallengeDraft({ ...draft, writeup: ' ' })).toMatchObject({
      success: false,
      error: 'Solution must be 1 to 8000 characters.',
    })
  })
})
