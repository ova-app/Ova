/**
 * Supabase — tests d'intégration légers avec mock complet.
 * Aucun appel réseau réel.
 *
 * Note: jest.mock() est hoisté avant les déclarations de variables.
 * On utilise jest.fn() directement dans la factory, puis on récupère
 * les références via require() après le mock.
 */

jest.mock('../lib/supabase', () => {
  const mockSelect  = jest.fn().mockReturnThis()
  const mockEq      = jest.fn().mockReturnThis()
  const mockOrder   = jest.fn().mockResolvedValue({ data: [], error: null })
  const mockFrom    = jest.fn().mockReturnValue({
    select: mockSelect,
    eq:     mockEq,
    order:  mockOrder,
  })
  const mockSignIn  = jest.fn().mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  })
  const mockSignUp  = jest.fn().mockResolvedValue({
    data: { user: { id: 'new-user-id', email: 'newuser@example.com' } },
    error: null,
  })
  const mockGetUser = jest.fn().mockResolvedValue({
    data: { user: { id: 'test-user-id' } },
    error: null,
  })
  const mockSignOut = jest.fn().mockResolvedValue({ error: null })

  return {
    supabase: {
      from: mockFrom,
      auth: {
        signInWithPassword: mockSignIn,
        signUp:             mockSignUp,
        getUser:            mockGetUser,
        signOut:            mockSignOut,
      },
      _mocks: { mockFrom, mockSelect, mockEq, mockOrder, mockSignIn, mockSignUp, mockGetUser, mockSignOut },
    },
  }
})

import { supabase } from '../lib/supabase'

// Récupère les mocks depuis la factory via le module mocké
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabase as any)._mocks as Record<string, any>

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('supabase auth — signInWithPassword', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('should call signInWithPassword with email and password', async () => {
    const email    = 'user@example.com'
    const password = 'securePassword123'

    await supabase.auth.signInWithPassword({ email, password })

    expect(mocks.mockSignIn).toHaveBeenCalledTimes(1)
    expect(mocks.mockSignIn).toHaveBeenCalledWith({ email, password })
  })

  it('should return user data on success', async () => {
    const result = await supabase.auth.signInWithPassword({
      email: 'user@example.com',
      password: 'pass',
    })
    expect(result.data.user?.id).toBe('test-user-id')
    expect(result.error).toBeNull()
  })

  it('should propagate auth errors when mock returns error', async () => {
    mocks.mockSignIn.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid credentials', status: 400 },
    })

    const result = await supabase.auth.signInWithPassword({
      email: 'bad@example.com',
      password: 'wrong',
    })
    expect(result.data.user).toBeNull()
    expect(result.error).not.toBeNull()
    expect(result.error?.message).toBe('Invalid credentials')
  })
})

describe('supabase auth — signUp', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('should call signUp with email and password', async () => {
    const email    = 'newuser@example.com'
    const password = 'newPassword123'

    await supabase.auth.signUp({ email, password })

    expect(mocks.mockSignUp).toHaveBeenCalledTimes(1)
    expect(mocks.mockSignUp).toHaveBeenCalledWith({ email, password })
  })

  it('should return a new user id on success', async () => {
    const result = await supabase.auth.signUp({
      email: 'newuser@example.com',
      password: 'pass',
    })
    expect(result.data.user?.id).toBe('new-user-id')
    expect(result.error).toBeNull()
  })
})

describe('supabase auth — getUser', () => {
  it('should return the current user', async () => {
    const result = await supabase.auth.getUser()
    expect(result.data.user?.id).toBe('test-user-id')
  })
})

describe('supabase auth — signOut', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('should call signOut and return no error', async () => {
    const result = await supabase.auth.signOut()
    expect(mocks.mockSignOut).toHaveBeenCalledTimes(1)
    expect(result.error).toBeNull()
  })
})

describe('supabase — from / query builder', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('should call from with the correct table name', () => {
    supabase.from('workouts')
    expect(mocks.mockFrom).toHaveBeenCalledWith('workouts')
  })

  it('should chain select → eq → order', async () => {
    mocks.mockSelect.mockReturnThis()
    mocks.mockEq.mockReturnThis()
    mocks.mockOrder.mockResolvedValue({ data: [{ id: '1' }], error: null })

    const result = await supabase.from('workouts').select('*').eq('user_id', 'abc').order('started_at')
    expect(mocks.mockSelect).toHaveBeenCalledWith('*')
    expect(mocks.mockEq).toHaveBeenCalledWith('user_id', 'abc')
    expect(mocks.mockOrder).toHaveBeenCalledWith('started_at')
    expect(result.data).toHaveLength(1)
  })
})
