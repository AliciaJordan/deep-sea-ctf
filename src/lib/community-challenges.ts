export type CommunityChallengeDraft = {
  title: string
  category: string
  difficulty: number
  description: string
  flag: string
  writeup: string
}

export type CommunityChallengeDraftResult =
  | { success: true; data: CommunityChallengeDraft }
  | { success: false; error: string }

export function parseCommunityChallengeDraft(params: Record<string, unknown>): CommunityChallengeDraftResult {
  const title = typeof params.title === 'string' ? params.title.trim() : ''
  const category = typeof params.category === 'string' ? params.category.trim() : ''
  const description = typeof params.description === 'string' ? params.description.trim() : ''
  const flag = typeof params.flag === 'string' ? params.flag.trim() : ''
  const writeup = typeof params.writeup === 'string' ? params.writeup.trim() : ''
  const difficulty = params.difficulty

  if (!title || title.length > 120) return { success: false, error: 'Title must be 1 to 120 characters.' }
  if (!category || category.length > 80) return { success: false, error: 'Category must be 1 to 80 characters.' }
  if (!description || description.length > 4000) return { success: false, error: 'Description must be 1 to 4000 characters.' }
  if (typeof difficulty !== 'number' || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) {
    return { success: false, error: 'Depth must be between 1 and 4.' }
  }
  if (!/^ocean\{[^\s{}]{8,256}\}$/.test(flag)) {
    return { success: false, error: 'Flag must use ocean{...} with 8 to 256 non-space characters inside.' }
  }
  if (!writeup || writeup.length > 8000) return { success: false, error: 'Solution must be 1 to 8000 characters.' }

  return {
    success: true,
    data: { title, category, difficulty, description, flag, writeup },
  }
}
