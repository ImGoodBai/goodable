import { promises as fs } from 'fs'
import path from 'path'

export interface SessionData {
  access_token?: string
  space_id?: string
  token_configured_at?: number
}

const CONFIG_FILE = path.join(process.cwd(), '.coze-config.json')

async function readConfig(): Promise<SessionData> {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    // 文件不存在或解析失败，返回空对象
    return {}
  }
}

async function writeConfig(data: SessionData): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export async function getAccessToken(): Promise<string | null> {
  const config = await readConfig()
  return config.access_token || null
}

export async function setAccessToken(token: string): Promise<void> {
  const config = await readConfig()
  config.access_token = token
  config.token_configured_at = Date.now()
  await writeConfig(config)
}

export async function getSpaceId(): Promise<string | null> {
  const config = await readConfig()
  return config.space_id || null
}

export async function setSpaceId(spaceId: string): Promise<void> {
  const config = await readConfig()
  config.space_id = spaceId
  await writeConfig(config)
}

export async function getSession(): Promise<SessionData> {
  return await readConfig()
}

export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(CONFIG_FILE)
  } catch (error) {
    // 文件不存在，忽略错误
  }
}
