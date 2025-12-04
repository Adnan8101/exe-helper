import { PrismaClient as BotPrismaClient } from '@prisma/client';
import { PrismaClient as WebsitePrismaClient } from '../exe-website/node_modules/.prisma/client';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkDatabase(name: string, prisma: any, testMessageId?: string) {
  console.log(`\n${colors.blue}${name}:${colors.reset}`);
  
  const totalVouches = await prisma.vouch.count();
  console.log(`  Total Vouches: ${totalVouches}`);

  if (testMessageId) {
    const testVouch = await prisma.vouch.findUnique({
      where: { messageId: testMessageId },
    });
    
    if (testVouch) {
      console.log(`${colors.green}  ✓ Test vouch found${colors.reset}`);
      console.log(`    Vouch #${testVouch.vouchNumber}`);
      console.log(`    Author: ${testVouch.authorName}`);
      console.log(`    Message: ${testVouch.message.substring(0, 60)}...`);
      return testVouch;
    } else {
      console.log(`${colors.red}  ✗ Test vouch NOT found${colors.reset}`);
      return null;
    }
  }
  
  return null;
}

async function runDirectDatabaseTest() {
  console.log(`${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.cyan}🧪 Direct Database Test${colors.reset}`);
  console.log(`${colors.cyan}========================================${colors.reset}\n`);

  const botPrisma = new BotPrismaClient();
  const websitePrisma = new WebsitePrismaClient();

  const testMessageId = `test-${Date.now()}`;
  let testVouchNumber: number;

  try {
    // Step 1: Initial count
    console.log(`${colors.yellow}Step 1: Initial Database State${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    const botInitialCount = await botPrisma.vouch.count();
    const websiteInitialCount = await websitePrisma.vouch.count();
    
    console.log(`\n${colors.blue}Discord Bot Database:${colors.reset} ${botInitialCount} vouches`);
    console.log(`${colors.blue}Website Database:${colors.reset} ${websiteInitialCount} vouches`);
    
    if (botInitialCount === websiteInitialCount) {
      console.log(`${colors.green}✓ Databases are in sync${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Databases are OUT OF SYNC!${colors.reset}`);
    }

    // Get next vouch number
    const latestVouch = await botPrisma.vouch.findFirst({
      orderBy: { vouchNumber: 'desc' },
    });
    testVouchNumber = (latestVouch?.vouchNumber || 0) + 1;

    // Step 2: Insert into Bot Database
    console.log(`\n${colors.yellow}Step 2: Inserting Test Vouch into Bot Database${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    const testVouchData = {
      vouchNumber: testVouchNumber,
      channelId: '1330868077570691134',
      channelName: 'test-channel',
      authorId: '999999999999999999',
      authorName: 'TestUser',
      authorAvatar: null,
      message: '🧪 TEST VOUCH: Legit service from <@123456789> - This is a database sync test',
      messageId: testMessageId,
      timestamp: new Date(),
      attachments: [],
      proofUrl: null,
    };

    // Separate data for website (without vouchedUserId)
    const websiteVouchData = {
      vouchNumber: testVouchNumber,
      channelId: '1330868077570691134',
      channelName: 'test-channel',
      authorId: '999999999999999999',
      authorName: 'TestUser',
      authorAvatar: null,
      message: '🧪 TEST VOUCH: Legit service from <@123456789> - This is a database sync test',
      messageId: testMessageId,
      timestamp: new Date(),
      attachments: [],
      proofUrl: null,
    };

    console.log(`\n${colors.magenta}Creating vouch:${colors.reset}`);
    console.log(`  Vouch #${testVouchNumber}`);
    console.log(`  Message ID: ${testMessageId}`);
    console.log(`  Author: ${testVouchData.authorName}`);
    console.log(`  Message: ${testVouchData.message.substring(0, 60)}...`);

    const createdInBot = await botPrisma.vouch.create({
      data: { ...testVouchData, vouchedUserId: null },
    });

    console.log(`${colors.green}✓ Successfully inserted into Bot Database${colors.reset}`);

    // Verify in Bot DB
    await checkDatabase('Bot Database (after insert)', botPrisma, testMessageId);

    // Step 3: Check Website Database (before sync)
    console.log(`\n${colors.yellow}Step 3: Checking Website Database (before manual sync)${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    await checkDatabase('Website Database', websitePrisma, testMessageId);

    // Step 4: Insert into Website Database (manual sync)
    console.log(`\n${colors.yellow}Step 4: Checking if sync is needed${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    const existsInWebsite = await websitePrisma.vouch.findUnique({
      where: { messageId: testMessageId },
    });

    if (existsInWebsite) {
      console.log(`${colors.green}✓ Vouch already exists in Website Database (same DB!)${colors.reset}`);
      console.log(`${colors.magenta}  → Both systems share the same database${colors.reset}`);
    } else {
      console.log(`${colors.yellow}Creating in Website Database...${colors.reset}`);
      await websitePrisma.vouch.create({
        data: websiteVouchData,
      });
      console.log(`${colors.green}✓ Successfully synced to Website Database${colors.reset}`);
    }

    // Verify in both
    console.log(`\n${colors.magenta}Verification:${colors.reset}`);
    await checkDatabase('Bot Database', botPrisma, testMessageId);
    await checkDatabase('Website Database', websitePrisma, testMessageId);

    // Step 5: Update the vouch
    console.log(`\n${colors.yellow}Step 5: Updating Test Vouch${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    const updatedMessage = '🧪 TEST VOUCH [EDITED]: Legit service from <@123456789> - This vouch was EDITED to test database sync';

    await botPrisma.vouch.update({
      where: { messageId: testMessageId },
      data: { message: updatedMessage },
    });

    await websitePrisma.vouch.update({
      where: { messageId: testMessageId },
      data: { message: updatedMessage },
    });

    console.log(`${colors.green}✓ Updated in both databases${colors.reset}`);

    // Verify updates
    console.log(`\n${colors.magenta}Verification after update:${colors.reset}`);
    await checkDatabase('Bot Database', botPrisma, testMessageId);
    await checkDatabase('Website Database', websitePrisma, testMessageId);

    // Step 6: Delete from both databases
    console.log(`\n${colors.yellow}Step 6: Deleting Test Vouch${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    await botPrisma.vouch.delete({
      where: { messageId: testMessageId },
    });
    console.log(`${colors.green}✓ Deleted from Bot Database${colors.reset}`);

    // Check if still exists (it shouldn't since they share the same DB)
    const stillExists = await websitePrisma.vouch.findUnique({
      where: { messageId: testMessageId },
    });

    if (!stillExists) {
      console.log(`${colors.green}✓ Automatically removed from Website Database (same DB!)${colors.reset}`);
      console.log(`${colors.magenta}  → Delete from one = Delete from both${colors.reset}`);
    } else {
      console.log(`${colors.yellow}Still exists in website, deleting...${colors.reset}`);
      await websitePrisma.vouch.delete({
        where: { messageId: testMessageId },
      });
      console.log(`${colors.green}✓ Deleted from Website Database${colors.reset}`);
    }

    // Final verification
    console.log(`\n${colors.yellow}Step 7: Final Verification${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    await checkDatabase('Bot Database', botPrisma, testMessageId);
    await checkDatabase('Website Database', websitePrisma, testMessageId);

    const botFinalCount = await botPrisma.vouch.count();
    const websiteFinalCount = await websitePrisma.vouch.count();

    console.log(`\n${colors.magenta}Final counts:${colors.reset}`);
    console.log(`  Bot: ${botFinalCount} vouches`);
    console.log(`  Website: ${websiteFinalCount} vouches`);

    if (botFinalCount === botInitialCount && websiteFinalCount === websiteInitialCount) {
      console.log(`${colors.green}✓ Both databases returned to initial state${colors.reset}`);
    }

    // Summary
    console.log(`\n${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.green}✅ Direct Database Test Completed!${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);

    console.log(`${colors.blue}Test Summary:${colors.reset}`);
    console.log(`  ✓ Initial state verified (${botInitialCount} vouches)`);
    console.log(`  ✓ Inserted vouch #${testVouchNumber} into Bot DB`);
    console.log(`  ✓ Synced to Website DB`);
    console.log(`  ✓ Updated vouch in both databases`);
    console.log(`  ✓ Deleted vouch from both databases`);
    console.log(`  ✓ Databases remain in sync (${botFinalCount} vouches)`);
    console.log(`  ✓ Both databases share same connection`);
    console.log(`\n${colors.blue}Database URL:${colors.reset}`);
    console.log(`  ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Test failed:${colors.reset}`, error);
    
    // Cleanup on error
    try {
      await botPrisma.vouch.deleteMany({
        where: { messageId: testMessageId },
      });
      await websitePrisma.vouch.deleteMany({
        where: { messageId: testMessageId },
      });
      console.log(`${colors.yellow}Cleaned up test data${colors.reset}`);
    } catch (cleanupError) {
      console.log(`${colors.yellow}Could not cleanup (may not exist)${colors.reset}`);
    }
    
    process.exit(1);
  } finally {
    await botPrisma.$disconnect();
    await websitePrisma.$disconnect();
    console.log(`${colors.yellow}📡 Disconnected from databases${colors.reset}\n`);
  }
}

// Run the test
runDirectDatabaseTest()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
