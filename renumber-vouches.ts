// Run this from the website directory with: npx tsx ../renumber-vouches.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function renumberVouches() {
  console.log('🔄 Starting vouch renumbering process...');

  try {
    // Get all vouches ordered by timestamp (oldest first)
    const vouches = await prisma.vouch.findMany({
      orderBy: {
        timestamp: 'asc',
      },
      select: {
        id: true,
        timestamp: true,
      },
    });

    console.log(`📊 Found ${vouches.length} vouches to renumber`);

    // Update each vouch with sequential numbers starting from 1
    for (let i = 0; i < vouches.length; i++) {
      const vouchNumber = i + 1;
      await prisma.vouch.update({
        where: { id: vouches[i].id },
        data: { vouchNumber },
      });

      if (vouchNumber % 50 === 0) {
        console.log(`✅ Processed ${vouchNumber} vouches...`);
      }
    }

    console.log('✨ All vouches have been successfully renumbered!');
    console.log(`📝 Total vouches numbered: ${vouches.length}`);
  } catch (error) {
    console.error('❌ Error renumbering vouches:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

renumberVouches();
