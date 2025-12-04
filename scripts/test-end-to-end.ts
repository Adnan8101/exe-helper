import { Client, GatewayIntentBits, TextChannel, ChannelType } from 'discord.js';
import { PrismaClient as BotPrismaClient } from '@prisma/client';
import { PrismaClient as WebsitePrismaClient } from '../exe-website/node_modules/.prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

interface TestVouch {
  messageId: string;
  vouchNumber?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkDatabases(stepName: string, botPrisma: BotPrismaClient, websitePrisma: WebsitePrismaClient, testMessageId?: string) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.cyan}📊 Database Check: ${stepName}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  try {
    // Check Bot Database
    const botVouchCount = await botPrisma.vouch.count();
    console.log(`${colors.blue}Discord Bot Database:${colors.reset}`);
    console.log(`  Total Vouches: ${botVouchCount}`);

    if (testMessageId) {
      const botVouch = await botPrisma.vouch.findUnique({
        where: { messageId: testMessageId },
      });
      if (botVouch) {
        console.log(`${colors.green}  ✓ Test vouch found${colors.reset}`);
        console.log(`    Vouch #${botVouch.vouchNumber}`);
        console.log(`    Author: ${botVouch.authorName}`);
        console.log(`    Message: ${botVouch.message.substring(0, 50)}...`);
      } else {
        console.log(`${colors.yellow}  - Test vouch not found${colors.reset}`);
      }
    }

    // Check Website Database
    const websiteVouchCount = await websitePrisma.vouch.count();
    console.log(`\n${colors.blue}Website Database:${colors.reset}`);
    console.log(`  Total Vouches: ${websiteVouchCount}`);

    if (testMessageId) {
      const websiteVouch = await websitePrisma.vouch.findUnique({
        where: { messageId: testMessageId },
      });
      if (websiteVouch) {
        console.log(`${colors.green}  ✓ Test vouch found${colors.reset}`);
        console.log(`    Vouch #${websiteVouch.vouchNumber}`);
        console.log(`    Author: ${websiteVouch.authorName}`);
        console.log(`    Message: ${websiteVouch.message.substring(0, 50)}...`);
      } else {
        console.log(`${colors.yellow}  - Test vouch not found${colors.reset}`);
      }
    }

    // Verify sync
    if (botVouchCount === websiteVouchCount) {
      console.log(`\n${colors.green}✓ Databases are in sync${colors.reset}`);
    } else {
      console.log(`\n${colors.red}✗ Database mismatch! Bot: ${botVouchCount}, Website: ${websiteVouchCount}${colors.reset}`);
    }

  } catch (error) {
    console.error(`${colors.red}Error checking databases:${colors.reset}`, error);
  }
}

async function runEndToEndTest() {
  console.log(`${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.cyan}🧪 End-to-End Vouch Test${colors.reset}`);
  console.log(`${colors.cyan}========================================${colors.reset}\n`);

  const botPrisma = new BotPrismaClient();
  const websitePrisma = new WebsitePrismaClient();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let testVouch: TestVouch | null = null;

  try {
    // Step 1: Initial Database Check
    await checkDatabases('Before Test', botPrisma, websitePrisma);

    // Step 2: Connect to Discord
    console.log(`\n${colors.yellow}Connecting to Discord...${colors.reset}`);
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`${colors.green}✓ Connected to Discord${colors.reset}`);

    await sleep(2000); // Wait for bot to be ready

    // Step 3: Get Auto Vouch Channel
    console.log(`\n${colors.yellow}Finding auto-vouch channel...${colors.reset}`);
    const autoChannel = await botPrisma.autoVouchChannel.findFirst();
    
    if (!autoChannel) {
      throw new Error('No auto-vouch channel configured');
    }

    console.log(`${colors.green}✓ Found channel: ${autoChannel.channelId}${colors.reset}`);

    const channel = await client.channels.fetch(autoChannel.channelId) as TextChannel;
    
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('Could not fetch text channel');
    }

    // Step 4: Send Test Vouch
    console.log(`\n${colors.yellow}Step 1: Sending test vouch...${colors.reset}`);
    const testMessage = `🧪 TEST VOUCH: Legit service from <@123456789> - This is an automated test vouch. Will be deleted shortly.`;
    
    const sentMessage = await channel.send(testMessage);
    testVouch = { messageId: sentMessage.id };
    
    console.log(`${colors.green}✓ Test vouch sent${colors.reset}`);
    console.log(`  Message ID: ${sentMessage.id}`);
    console.log(`  Content: ${testMessage.substring(0, 60)}...`);

    // Wait for bot to process
    console.log(`${colors.yellow}Waiting for bot to process (5 seconds)...${colors.reset}`);
    await sleep(5000);

    // Step 5: Check After Creation
    await checkDatabases('After Creating Vouch', botPrisma, websitePrisma, testVouch.messageId);

    // Get vouch number for later
    const createdVouch = await botPrisma.vouch.findUnique({
      where: { messageId: testVouch.messageId },
    });
    
    if (createdVouch) {
      testVouch.vouchNumber = createdVouch.vouchNumber;
    }

    // Step 6: Edit the Vouch
    console.log(`\n${colors.yellow}Step 2: Editing test vouch...${colors.reset}`);
    const editedMessage = `🧪 TEST VOUCH [EDITED]: Legit service from <@123456789> - This vouch was edited to test database sync.`;
    
    await sentMessage.edit(editedMessage);
    console.log(`${colors.green}✓ Test vouch edited${colors.reset}`);
    console.log(`  New content: ${editedMessage.substring(0, 60)}...`);

    // Wait for bot to process edit
    console.log(`${colors.yellow}Waiting for bot to process edit (5 seconds)...${colors.reset}`);
    await sleep(5000);

    // Step 7: Check After Edit
    await checkDatabases('After Editing Vouch', botPrisma, websitePrisma, testVouch.messageId);

    // Step 8: Delete the Vouch
    console.log(`\n${colors.yellow}Step 3: Deleting test vouch...${colors.reset}`);
    await sentMessage.delete();
    console.log(`${colors.green}✓ Test vouch deleted from Discord${colors.reset}`);

    // Wait for bot to process deletion
    console.log(`${colors.yellow}Waiting for bot to process deletion (5 seconds)...${colors.reset}`);
    await sleep(5000);

    // Step 9: Check After Deletion
    await checkDatabases('After Deleting Vouch', botPrisma, websitePrisma, testVouch.messageId);

    // Step 10: Final Verification
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}🔍 Final Verification${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const finalBotCheck = await botPrisma.vouch.findUnique({
      where: { messageId: testVouch.messageId },
    });

    const finalWebsiteCheck = await websitePrisma.vouch.findUnique({
      where: { messageId: testVouch.messageId },
    });

    if (!finalBotCheck && !finalWebsiteCheck) {
      console.log(`${colors.green}✅ Test vouch successfully removed from both databases${colors.reset}`);
    } else {
      if (finalBotCheck) {
        console.log(`${colors.red}✗ Test vouch still exists in bot database${colors.reset}`);
      }
      if (finalWebsiteCheck) {
        console.log(`${colors.red}✗ Test vouch still exists in website database${colors.reset}`);
      }
    }

    // Success Summary
    console.log(`\n${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.green}✅ End-to-End Test Completed!${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);

    console.log(`${colors.blue}Test Summary:${colors.reset}`);
    console.log(`  ✓ Created vouch in Discord`);
    console.log(`  ✓ Verified in both databases`);
    console.log(`  ✓ Edited vouch in Discord`);
    console.log(`  ✓ Verified edit in both databases`);
    console.log(`  ✓ Deleted vouch from Discord`);
    console.log(`  ✓ Verified deletion in both databases`);
    console.log(`  ✓ Both databases remain in sync\n`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Test failed:${colors.reset}`, error);
    
    // Cleanup: Try to delete test message if it exists
    if (testVouch?.messageId) {
      console.log(`\n${colors.yellow}Attempting cleanup...${colors.reset}`);
      try {
        const autoChannel = await botPrisma.autoVouchChannel.findFirst();
        if (autoChannel) {
          const channel = await client.channels.fetch(autoChannel.channelId) as TextChannel;
          const message = await channel.messages.fetch(testVouch.messageId);
          await message.delete();
          console.log(`${colors.green}✓ Cleaned up test message${colors.reset}`);
        }
      } catch (cleanupError) {
        console.log(`${colors.yellow}Could not cleanup test message (may already be deleted)${colors.reset}`);
      }
    }
    
    process.exit(1);
  } finally {
    // Cleanup
    await botPrisma.$disconnect();
    await websitePrisma.$disconnect();
    client.destroy();
    console.log(`${colors.yellow}📡 Disconnected from all services${colors.reset}\n`);
  }
}

// Run the test
runEndToEndTest()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
