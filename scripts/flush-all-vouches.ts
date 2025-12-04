import { PrismaClient } from '@prisma/client';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

async function flushAllVouches() {
  const prisma = new PrismaClient();

  try {
    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.cyan}🗑️  Flushing All Vouches${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);

    // Get current count
    const currentCount = await prisma.vouch.count();
    console.log(`${colors.yellow}Current vouches in database: ${currentCount}${colors.reset}\n`);

    if (currentCount === 0) {
      console.log(`${colors.green}✓ Database is already empty${colors.reset}\n`);
      return;
    }

    // Confirm deletion
    console.log(`${colors.red}⚠️  WARNING: This will delete ALL ${currentCount} vouches!${colors.reset}`);
    console.log(`${colors.yellow}Proceeding in 2 seconds...${colors.reset}\n`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Delete all vouches
    const result = await prisma.vouch.deleteMany({});
    
    console.log(`${colors.green}✓ Deleted ${result.count} vouches${colors.reset}`);

    // Verify
    const finalCount = await prisma.vouch.count();
    console.log(`${colors.green}✓ Final count: ${finalCount} vouches${colors.reset}\n`);

    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.green}✅ Flush Completed!${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Error:${colors.reset}`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

flushAllVouches();
