import { Message } from 'discord.js';

// Positive keywords to check (case insensitive)
const POSITIVE_KEYWORDS = [
  'legit',
  'vouch',
  'trusted',
  'rep',
  '+rep',
  'ref',
  'thanks',
  'tysm',
  'ty',
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
  'upi',
  'paytm',
  'gpay',
  'phonepe',
  'robux',
  'credits',
  'sol',
  'xrp',
  'binance',
  'cash',
  'money',
  'amount',
  'deal',
  'trade',
  'exchange',
  'swap',
  'sell',
  'buy',
];

/**
 * Validates if a message is a valid vouch
 * Requirements:
 * 1. Must contain a positive keyword (legit, vouch, etc.)
 * 2. Must mention someone (the person being vouched for)
 * 3. Must contain some value/currency keyword
 */
export function isValidVouch(message: Message): boolean {
  const content = message.content.toLowerCase();
  
  // Check 1: Must contain a positive keyword
  const hasPositiveKeyword = POSITIVE_KEYWORDS.some(keyword => content.includes(keyword));
  if (!hasPositiveKeyword) {
    return false;
  }
  
  // Check 2: Must mention someone
  // We allow vouching for anyone, not just specific admins
  if (message.mentions.users.size === 0) {
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
 * Cleans a vouch message for display
 * Removes custom emojis and extra whitespace
 */
export function cleanVouchMessage(content: string): string {
  // Remove custom emojis <:name:id> and <a:name:id>
  let cleaned = content.replace(/<a?:.+?:\d+>/g, '');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  // Remove multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return cleaned;
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
  const cryptoMatch = text.match(/(?:\$|usd)?\s*(\d+\.?\d*)\s*(?:\$|usd)?\s*(ltc|btc|eth|usdt|crypto|sol|xrp)/i);
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

  // Check for Robux
  const robuxMatch = text.match(/(\d+)\s*(?:robux|rbx)/i);
  if (robuxMatch) {
    return `${robuxMatch[1]} Robux`;
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
