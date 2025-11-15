/**
 * World-Class Proof Insertion Script
 * 
 * This script parses the proof collection file and inserts all 114 valid image URLs
 * into the database with proper structure and validation.
 * 
 * Features:
 * - Parses complex log file format
 * - Extracts only VALID image URLs (marked as ✅ VALID)
 * - Uses CDN URLs (prefers cdn.discordapp.com over media.discordapp.net)
 * - Prevents duplicates
 * - Shows real-time progress
 * - Creates detailed summary
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface ParsedProof {
  messageId: string;
  authorName: string;
  content: string;
  imageUrl: string;
  timestamp: Date;
}

// Parse the proof collection file
function parseProofCollectionFile(filePath: string): ParsedProof[] {
  console.log('📖 Reading proof collection file...\n');
  
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n');
  
  const proofs: ParsedProof[] = [];
  let currentMessage: {
    id: string | null;
    author: string | null;
    content: string | null;
    urls: string[];
  } = {
    id: null,
    author: null,
    content: null,
    urls: [],
  };
  
  let isInUrlSection = false;
  let isInVerificationSection = false;
  let currentUrl: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect message start
    if (line.match(/^📝 Message \d+ from (.+):$/)) {
      const match = line.match(/^📝 Message \d+ from (.+):$/);
      if (match) {
        currentMessage.author = match[1];
      }
    }
    
    // Extract Message ID
    if (line.startsWith('Message ID:')) {
      currentMessage.id = line.split(':')[1].trim();
    }
    
    // Extract Content
    if (line.startsWith('Content:')) {
      currentMessage.content = line.substring('Content:'.length).trim();
    }
    
    // Detect URL extraction section
    if (line.startsWith('Extracted URLs (')) {
      isInUrlSection = true;
      isInVerificationSection = false;
    }
    
    // Detect verification section
    if (line.includes('🔍 Verifying') && line.includes('unique URLs')) {
      isInUrlSection = false;
      isInVerificationSection = true;
    }
    
    // Capture URLs from extraction section
    if (isInUrlSection && line.match(/^\d+\.\s+https?:\/\//)) {
      const urlMatch = line.match(/^\d+\.\s+(https?:\/\/.+)$/);
      if (urlMatch) {
        const url = urlMatch[1].trim();
        // Only save URLs that will be verified as valid
        // We'll filter them in the verification section
      }
    }
    
    // Capture URL being verified
    if (isInVerificationSection && line.startsWith('🌐 Checking:')) {
      currentUrl = line.substring('🌐 Checking:'.length).trim();
    }
    
    // Check if URL is valid
    if (isInVerificationSection && currentUrl && line.includes('✅ VALID - Image accessible and will be saved')) {
      // This URL is valid, add it
      currentMessage.urls.push(currentUrl);
      currentUrl = null;
    }
    
    // Check if URL is invalid
    if (isInVerificationSection && currentUrl && line.includes('❌ INVALID')) {
      // Skip invalid URLs
      currentUrl = null;
    }
    
    // Detect message summary (end of message processing)
    if (line.startsWith('📊 Message Summary:') && currentMessage.id) {
      // Save all valid URLs for this message
      if (currentMessage.urls.length > 0) {
        currentMessage.urls.forEach(url => {
          proofs.push({
            messageId: currentMessage.id!,
            authorName: currentMessage.author || 'Unknown',
            content: currentMessage.content || '[No content]',
            imageUrl: url,
            timestamp: new Date(), // Will be updated with real timestamp if available
          });
        });
      }
      
      // Reset for next message
      currentMessage = {
        id: null,
        author: null,
        content: null,
        urls: [],
      };
      isInUrlSection = false;
      isInVerificationSection = false;
    }
  }
  
  console.log(`✅ Parsed ${proofs.length} valid proof records from file\n`);
  
  return proofs;
}

// Deduplicate image URLs (prefer CDN over media.discordapp.net)
function deduplicateProofs(proofs: ParsedProof[]): ParsedProof[] {
  console.log('🔍 Deduplicating image URLs...\n');
  
  const urlMap = new Map<string, ParsedProof>();
  
  for (const proof of proofs) {
    // Extract the core URL without query params to identify duplicates
    const baseUrl = proof.imageUrl.split('?')[0];
    
    // Check if we already have this base URL
    const existing = urlMap.get(baseUrl);
    
    if (!existing) {
      // New URL, add it
      urlMap.set(baseUrl, proof);
    } else {
      // Prefer cdn.discordapp.com over media.discordapp.net
      const isCdn = proof.imageUrl.includes('cdn.discordapp.com');
      const existingIsCdn = existing.imageUrl.includes('cdn.discordapp.com');
      
      if (isCdn && !existingIsCdn) {
        // Replace with CDN version
        urlMap.set(baseUrl, proof);
      }
    }
  }
  
  const deduplicated = Array.from(urlMap.values());
  console.log(`✅ Reduced from ${proofs.length} to ${deduplicated.length} unique image URLs\n`);
  
  return deduplicated;
}

// Main execution function
async function main() {
  console.log('\n🚀 ========== WORLD-CLASS PROOF INSERTION SCRIPT ==========\n');
  
  const filePath = path.join(process.cwd(), 'proof-collection-1763206250004.txt');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error('❌ Error: proof-collection-1763206250004.txt not found in current directory');
    console.error('   Please make sure the file is in the root directory of the project\n');
    process.exit(1);
  }
  
  try {
    // Step 1: Parse the file
    console.log('📋 Step 1: Parsing proof collection file...\n');
    const parsedProofs = parseProofCollectionFile(filePath);
    
    if (parsedProofs.length === 0) {
      console.error('❌ No valid proofs found in the file\n');
      process.exit(1);
    }
    
    // Step 2: Deduplicate
    console.log('📋 Step 2: Deduplicating image URLs...\n');
    const uniqueProofs = deduplicateProofs(parsedProofs);
    
    // Step 2.5: Check for existing URLs in database
    console.log('📋 Step 2.5: Checking for existing URLs in database...\n');
    const existingProofs = await prisma.proof.findMany({
      select: {
        imageUrls: true,
      },
    });
    
    // Create a set of all existing image URLs in the database
    const existingUrls = new Set<string>();
    existingProofs.forEach(proof => {
      proof.imageUrls.forEach(url => {
        // Normalize URL by removing query params for comparison
        const baseUrl = url.split('?')[0];
        existingUrls.add(baseUrl);
      });
    });
    
    // Filter out proofs with URLs that already exist
    const newProofs = uniqueProofs.filter(proof => {
      const baseUrl = proof.imageUrl.split('?')[0];
      return !existingUrls.has(baseUrl);
    });
    
    const skippedCount = uniqueProofs.length - newProofs.length;
    console.log(`   Found ${existingUrls.size} existing URLs in database`);
    console.log(`   Filtered ${skippedCount} duplicate URLs`);
    console.log(`   ${newProofs.length} new unique URLs to insert\n`);
    
    if (newProofs.length === 0) {
      console.log('✅ All URLs already exist in the database. Nothing to insert.\n');
      await prisma.$disconnect();
      return;
    }
    
    // Use newProofs instead of uniqueProofs for the rest of the script
    const uniqueProofs_final = newProofs;
    
    // Step 3: Show summary before insertion
    console.log('📊 ========== PRE-INSERTION SUMMARY ==========\n');
    console.log(`   Total valid image URLs to insert: ${uniqueProofs_final.length}`);
    
    const authorCounts = new Map<string, number>();
    uniqueProofs_final.forEach(proof => {
      const count = authorCounts.get(proof.authorName) || 0;
      authorCounts.set(proof.authorName, count + 1);
    });
    
    console.log(`   Unique contributors: ${authorCounts.size}`);
    console.log('\n   Top contributors:');
    const topContributors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    topContributors.forEach(([author, count], idx) => {
      console.log(`      ${idx + 1}. ${author}: ${count} images`);
    });
    
    console.log('\n📋 Step 3: Creating database session...\n');
    
    // Create a ProofSession
    const session = await prisma.proofSession.create({
      data: {
        channelId: '1419783509521993929',
        channelName: '﹒proofs﹒ᝰ',
        totalProofs: uniqueProofs_final.length,
        totalImages: uniqueProofs_final.length,
        startedBy: 'script_insert',
        completedAt: new Date(),
      },
    });
    
    console.log(`✅ Created session: ${session.id}\n`);
    
    // Step 4: Insert into database with progress
    console.log('📋 Step 4: Inserting proofs into database...\n');
    
    let inserted = 0;
    let failed = 0;
    
    // Insert each proof individually to ensure all images are added
    for (let i = 0; i < uniqueProofs_final.length; i++) {
      const proof = uniqueProofs_final[i];
      
      try {
        // Generate a unique messageId for each image to avoid duplicate key conflicts
        const uniqueMessageId = `${proof.messageId}_img_${i}`;
        
        await prisma.proof.create({
          data: {
            channelId: '1419783509521993929',
            channelName: '﹒proofs﹒ᝰ',
            authorId: 'unknown',
            authorName: proof.authorName,
            authorAvatar: null,
            message: proof.content,
            messageId: uniqueMessageId,
            timestamp: proof.timestamp,
            imageUrls: [proof.imageUrl],
          },
        });
        
        inserted++;
        
        const percentage = Math.round(((i + 1) / uniqueProofs_final.length) * 100);
        console.log(`   Progress: ${i + 1}/${uniqueProofs_final.length} (${percentage}%) | Inserted: ${inserted} | Failed: ${failed}`);
      } catch (error) {
        failed++;
        console.error(`   ❌ Error inserting proof ${i + 1}:`, error);
      }
    }
    
    // Step 5: Update session
    await prisma.proofSession.update({
      where: { id: session.id },
      data: {
        isPushed: true,
        pushedAt: new Date(),
        summary: `Inserted ${inserted} proofs (${failed} failed, ${skippedCount} duplicates skipped) from file import`,
      },
    });
    
    // Step 6: Final summary
    console.log('\n✅ ========== INSERTION COMPLETE ==========\n');
    console.log(`   Total images processed: ${uniqueProofs_final.length}`);
    console.log(`   Successfully inserted: ${inserted}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Duplicates skipped: ${skippedCount}`);
    console.log(`   Session ID: ${session.id}`);
    
    // Verify database
    const totalInDb = await prisma.proof.count();
    console.log(`\n📊 Total proofs in database: ${totalInDb}`);
    
    console.log('\n🎉 All done! Your proofs are now in the database and ready to display.\n');
    
  } catch (error) {
    console.error('\n❌ Error during insertion:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
