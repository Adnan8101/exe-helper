import { prisma } from '../database';

// Cache for auto-vouch and auto-proof channels
let autoVouchChannels: Set<string> = new Set();
let autoProofChannels: Set<string> = new Set();
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30 seconds

// Prefix cache
let botPrefix = '!';

export async function loadChannelCache() {
  const [vouchChannels, proofChannels] = await Promise.all([
    prisma.autoVouchChannel.findMany({
      where: { isEnabled: true },
      select: { channelId: true },
    }),
    prisma.autoProofChannel.findMany({
      where: { isEnabled: true },
      select: { channelId: true },
    }),
  ]);
  
  autoVouchChannels = new Set(vouchChannels.map(c => c.channelId));
  autoProofChannels = new Set(proofChannels.map(c => c.channelId));
  lastCacheUpdate = Date.now();
  
  console.log(`📦 Cache loaded: ${autoVouchChannels.size} vouch channels, ${autoProofChannels.size} proof channels`);
}

export async function refreshCacheIfNeeded() {
  if (Date.now() - lastCacheUpdate > CACHE_TTL) {
    await loadChannelCache();
  }
}

export function isAutoVouchChannel(channelId: string): boolean {
  return autoVouchChannels.has(channelId);
}

export function isAutoProofChannel(channelId: string): boolean {
  return autoProofChannels.has(channelId);
}

export function addVouchChannel(channelId: string) {
  autoVouchChannels.add(channelId);
}

export function removeVouchChannel(channelId: string) {
  autoVouchChannels.delete(channelId);
}

export function addProofChannel(channelId: string) {
  autoProofChannels.add(channelId);
}

export function removeProofChannel(channelId: string) {
  autoProofChannels.delete(channelId);
}

export function getBotPrefix(): string {
  return botPrefix;
}

export function setBotPrefix(prefix: string) {
  botPrefix = prefix;
}
