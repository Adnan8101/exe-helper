import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reindexVouches() {
  try {
    console.log('🔄 Starting vouch reindexing...\n');

    // Get all vouches ordered by timestamp (oldest first)
    const vouches = await prisma.vouch.findMany({
      orderBy: [
        { timestamp: 'asc' },
        { createdAt: 'asc' }
      ],
      select: {
        id: true,
        vouchNumber: true,
        messageId: true,
        authorName: true,
        timestamp: true,
      },
    });

    console.log(`📊 Found ${vouches.length} vouches to reindex\n`);

    if (vouches.length === 0) {
      console.log('✅ No vouches to reindex');
      return;
    }

    // Reindex each vouch sequentially
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < vouches.length; i++) {
      const vouch = vouches[i];
      const newVouchNumber = i + 1; // Start from 1

      try {
        if (vouch.vouchNumber !== newVouchNumber) {
          await prisma.vouch.update({
            where: { id: vouch.id },
            data: { vouchNumber: newVouchNumber },
          });

          console.log(`✅ #${vouch.vouchNumber} → #${newVouchNumber} | ${vouch.authorName} | ${vouch.timestamp.toLocaleDateString()}`);
          successCount++;
        } else {
          console.log(`⏭️  #${newVouchNumber} already correct | ${vouch.authorName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to update vouch ${vouch.id}:`, error);
        errorCount++;
      }
    }

    // Reset the sequence to the next number
    const nextSequence = vouches.length + 1;
    await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('"Vouch"', 'vouchNumber'), ${nextSequence}, false);`;

    console.log('\n📊 Reindexing Summary:');
    console.log(`   Total vouches: ${vouches.length}`);
    console.log(`   ✅ Updated: ${successCount}`);
    console.log(`   ⏭️  Already correct: ${vouches.length - successCount - errorCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   🔢 Next vouch number will be: ${nextSequence}`);
    console.log('\n✅ Vouch reindexing complete!');

  } catch (error) {
    console.error('❌ Error during reindexing:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
reindexVouches()
  .then(() => {
    console.log('\n👍 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
