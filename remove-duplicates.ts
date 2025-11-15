/**
 * Remove Duplicate URLs Script
 * 
 * This script removes duplicate image URLs from the database.
 * It keeps only one proof record per unique image URL.
 * Valid URL format: https://cdn.discordapp.com/attachments/...
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🧹 ========== REMOVE DUPLICATE URLS SCRIPT ==========\n');
  
  try {
    // Step 1: Get all proofs
    console.log('📋 Step 1: Fetching all proofs from database...\n');
    const allProofs = await prisma.proof.findMany({
      orderBy: {
        createdAt: 'asc', // Keep the oldest ones
      },
    });
    
    console.log(`   Found ${allProofs.length} total proof records\n`);
    
    if (allProofs.length === 0) {
      console.log('✅ Database is empty. Nothing to clean.\n');
      return;
    }
    
    // Step 2: Identify duplicates
    console.log('📋 Step 2: Identifying duplicate URLs...\n');
    
    const seenUrls = new Map<string, string>(); // baseUrl -> proofId (first occurrence)
    const duplicateIds: string[] = [];
    
    for (const proof of allProofs) {
      // Each proof should have one imageUrl
      if (proof.imageUrls.length === 0) continue;
      
      const url = proof.imageUrls[0]; // Get the first (and should be only) URL
      
      // Normalize URL by removing query parameters and extracting filename
      const baseUrl = url.split('?')[0];
      const filename = baseUrl.substring(baseUrl.lastIndexOf('/') + 1);
      
      // Check if we've seen this filename before
      const firstProofId = seenUrls.get(filename);
      
      if (firstProofId) {
        // This is a duplicate - mark this proof for deletion
        duplicateIds.push(proof.id);
        console.log(`   🔍 Duplicate found: ${filename}`);
      } else {
        // First time seeing this URL
        seenUrls.set(filename, proof.id);
      }
    }
    
    console.log(`\n   Total unique URLs: ${seenUrls.size}`);
    console.log(`   Duplicate records to remove: ${duplicateIds.length}\n`);
    
    if (duplicateIds.length === 0) {
      console.log('✅ No duplicates found! Database is clean.\n');
      return;
    }
    
    // Step 3: Remove duplicates
    console.log('📋 Step 3: Removing duplicate records...\n');
    
    const result = await prisma.proof.deleteMany({
      where: {
        id: {
          in: duplicateIds,
        },
      },
    });
    
    console.log(`✅ Deleted ${result.count} duplicate records\n`);
    
    // Step 4: Verify
    const remainingCount = await prisma.proof.count();
    console.log('📊 ========== CLEANUP COMPLETE ==========\n');
    console.log(`   Original records: ${allProofs.length}`);
    console.log(`   Deleted duplicates: ${result.count}`);
    console.log(`   Remaining records: ${remainingCount}`);
    console.log(`   Unique URLs: ${seenUrls.size}\n`);
    
    console.log('🎉 Database is now clean with unique URLs only!\n');
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
