import { db } from '@/lib/db/client';
import { serviceTokens } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateId } from '@/lib/utils/id';

const SUPPORTED_PROVIDERS = ['github', 'supabase', 'vercel'] as const;
export type ServiceProvider = (typeof SUPPORTED_PROVIDERS)[number];

interface ServiceTokenRecord {
  id: string;
  provider: ServiceProvider;
  name: string;
  token: string | null;
  created_at: string;
  last_used: string | null;
}

function assertProvider(provider: string): asserts provider is ServiceProvider {
  if (!SUPPORTED_PROVIDERS.includes(provider as ServiceProvider)) {
    throw new Error('Invalid provider');
  }
}

function toResponse(model: {
  id: string;
  provider: string;
  name: string;
  token: string;
  createdAt: string;
  lastUsed: string | null;
}): ServiceTokenRecord {
  return {
    id: model.id,
    provider: model.provider as ServiceProvider,
    name: model.name,
    token: model.token,
    created_at: model.createdAt,
    last_used: model.lastUsed,
  };
}

export async function createServiceToken(
  provider: string,
  token: string,
  name: string,
): Promise<ServiceTokenRecord> {
  assertProvider(provider);

  if (!token.trim()) {
    throw new Error('Token cannot be empty');
  }

  // 删除旧token
  await db.delete(serviceTokens)
    .where(eq(serviceTokens.provider, provider));

  const nowIso = new Date().toISOString();
  const stored = await db.insert(serviceTokens)
    .values({
      id: generateId(),
      provider,
      name: name.trim() || `${provider.charAt(0).toUpperCase()}${provider.slice(1)} Token`,
      token: token.trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUsed: null
    })
    .returning();

  return toResponse(stored[0]);
}

export async function getServiceToken(provider: string): Promise<ServiceTokenRecord | null> {
  assertProvider(provider);

  const result = await db.select()
    .from(serviceTokens)
    .where(eq(serviceTokens.provider, provider))
    .orderBy(desc(serviceTokens.createdAt))
    .limit(1);

  return result[0] ? toResponse(result[0]) : null;
}

export async function deleteServiceToken(tokenId: string): Promise<boolean> {
  try {
    await db.delete(serviceTokens)
      .where(eq(serviceTokens.id, tokenId));
    return true;
  } catch (error) {
    return false;
  }
}

export async function getPlainServiceToken(provider: string): Promise<string | null> {
  assertProvider(provider);

  const result = await db.select()
    .from(serviceTokens)
    .where(eq(serviceTokens.provider, provider))
    .limit(1);

  if (!result[0]) {
    return null;
  }

  return result[0].token;
}

export async function touchServiceToken(provider: string): Promise<void> {
  assertProvider(provider);

  await db.update(serviceTokens)
    .set({
      lastUsed: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    .where(eq(serviceTokens.provider, provider));
}
