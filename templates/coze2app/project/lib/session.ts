import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  access_token?: string
  space_id?: string
  token_configured_at?: number
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: 'coze_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  return getIronSession<SessionData>(cookieStore, sessionOptions)
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  return session.access_token || null
}

export async function setAccessToken(token: string): Promise<void> {
  const session = await getSession()
  session.access_token = token
  session.token_configured_at = Date.now()
  await session.save()
}

export async function clearSession(): Promise<void> {
  const session = await getSession()
  session.destroy()
}
