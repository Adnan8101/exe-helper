import { Message } from 'discord.js';

// User IDs to check for mentions
const REQUIRED_USER_IDS = [
  '643480211421265930', // @rex.f
  '959653911923396629', // @imunknown69
];

// Value keywords to check (case insensitive)
const VALUE_KEYWORDS = [
  'inr',
  'owo',
  'nitro',
  'decor',
  'ltc',
  'btc',
  'crypto',
  'usd',
  'dollar',
  '$',
  'rs',
  'rupee',
  'eth',
  'usdt',
];

/**
 * Validates if a message is a valid vouch
 * Requirements:
 * 1. Must contain the word "legit" (case insensitive)
 * 2. Must mention either @rex.f or @imunknown69
 * 3. Must contain some value/currency keyword
 */
export function isValidVouch(message: Message): boolean {
  const content = message.content.toLowerCase();
  
  // Check 1: Must contain "legit"
  if (!content.includes('legit')) {
    return false;
  }
  
  // Check 2: Must mention one of the required users
  const hasMention = message.mentions.users.some(user => 
    REQUIRED_USER_IDS.includes(user.id)
  );
  
  if (!hasMention) {
    return false;
  }
  
  // Check 3: Must contain a value keyword
  const hasValue = VALUE_KEYWORDS.some(keyword => content.includes(keyword));
  
  if (!hasValue) {
    return false;
  }
  
  return true;
}

/**
 * Extracts value information from a vouch message
 */
export function extractVouchValue(content: string): string | null {
  const text = content.toLowerCase();
  
  // Try to extract INR amounts
  const inrMatch = text.match(/(\d+)\s*(?:inr|rs|rupee)/i);
  if (inrMatch) {
    return `${inrMatch[1]} INR`;
  }
  
  // Try to extract OWO amounts
  const owoMatch = text.match(/([\d.]+)\s*([km])?\s*owo/i);
  if (owoMatch) {
    const amount = owoMatch[1];
    const multiplier = owoMatch[2] ? owoMatch[2].toUpperCase() : '';
    return `${amount}${multiplier} OWO`;
  }
  
  // Try to extract crypto amounts
  const cryptoMatch = text.match(/(?:\$|usd)?\s*(\d+\.?\d*)\s*(?:\$|usd)?\s*(ltc|btc|eth|usdt|crypto)/i);
  if (cryptoMatch) {
    return `$${cryptoMatch[1]} ${cryptoMatch[2].toUpperCase()}`;
  }
  
  // Check for nitro
  if (text.includes('nitro')) {
    return 'Nitro';
  }
  
  // Check for decor
  if (text.includes('decor')) {
    return 'Decor';
  }
  
  return null;
}

/**
 * Extracts image URLs from a message (including Discord CDN)
 */
export function extractImageUrls(message: Message): string[] {
  const imageUrls: string[] = [];
  
  // Get attachments
  message.attachments.forEach((attachment) => {
    if (attachment.url) {
      imageUrls.push(attachment.url);
    }
  });
  
  // Get embeds with images
  message.embeds.forEach((embed) => {
    if (embed.image?.url) {
      imageUrls.push(embed.image.url);
    }
    if (embed.thumbnail?.url) {
      imageUrls.push(embed.thumbnail.url);
    }
  });
  
  // Extract Discord CDN URLs from message content
  const cdnPattern = /https?:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/\d+\/\d+\/[^\s<>"']+/gi;
  const matches = message.content.match(cdnPattern);
  if (matches) {
    imageUrls.push(...matches);
  }
  
  // Deduplicate
  return [...new Set(imageUrls)];
}

/**
 * Validates if a message has valid image URLs for proof
 */
export function hasValidProofImages(message: Message): boolean {
  const imageUrls = extractImageUrls(message);
  return imageUrls.length > 0;
}
