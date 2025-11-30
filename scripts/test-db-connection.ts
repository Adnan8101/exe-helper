import { PrismaClient } from '@prisma/client';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function testDatabaseConnection() {
  console.log(`${colors.cyan}========================================${colors.reset}`);
  console.log(`${colors.cyan}🔧 Database Connection Test${colors.reset}`);
  console.log(`${colors.cyan}========================================${colors.reset}\n`);

  const prisma = new PrismaClient({
    log: ['error', 'warn'],
  });

  try {
    // Test 1: Basic Connection
    console.log(`${colors.yellow}Test 1: Basic Connection${colors.reset}`);
    await prisma.$connect();
    console.log(`${colors.green}✓ Successfully connected to database${colors.reset}\n`);

    // Test 2: Query Database Version
    console.log(`${colors.yellow}Test 2: Database Version${colors.reset}`);
    const result = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    console.log(`${colors.green}✓ PostgreSQL Version:${colors.reset}`);
    console.log(`  ${result[0].version}\n`);

    // Test 3: List All Tables
    console.log(`${colors.yellow}Test 3: Database Tables${colors.reset}`);
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    console.log(`${colors.green}✓ Found ${tables.length} tables:${colors.reset}`);
    tables.forEach((table) => console.log(`  - ${table.tablename}`));
    console.log('');

    // Test 4: Count Records in Key Tables
    console.log(`${colors.yellow}Test 4: Record Counts${colors.reset}`);
    
    try {
      const vouchCount = await prisma.vouch.count();
      console.log(`${colors.green}✓ Vouches:${colors.reset} ${vouchCount}`);
    } catch (e) {
      console.log(`${colors.red}✗ Vouch table not accessible${colors.reset}`);
    }

    try {
      const proofCount = await prisma.proof.count();
      console.log(`${colors.green}✓ Proofs:${colors.reset} ${proofCount}`);
    } catch (e) {
      console.log(`${colors.red}✗ Proof table not accessible${colors.reset}`);
    }

    try {
      const channelCount = await prisma.autoVouchChannel.count();
      console.log(`${colors.green}✓ Auto Vouch Channels:${colors.reset} ${channelCount}`);
    } catch (e) {
      console.log(`${colors.red}✗ AutoVouchChannel table not accessible${colors.reset}`);
    }

    try {
      const sessionCount = await prisma.captureSession.count();
      console.log(`${colors.green}✓ Capture Sessions:${colors.reset} ${sessionCount}`);
    } catch (e) {
      console.log(`${colors.red}✗ CaptureSession table not accessible${colors.reset}`);
    }

    console.log('');

    // Test 5: Check Migrations
    console.log(`${colors.yellow}Test 5: Migration Status${colors.reset}`);
    try {
      const migrations = await prisma.$queryRaw<Array<{ migration_name: string, finished_at: Date }>>`
        SELECT migration_name, finished_at 
        FROM "_prisma_migrations" 
        ORDER BY finished_at DESC 
        LIMIT 5
      `;
      console.log(`${colors.green}✓ Recent migrations:${colors.reset}`);
      migrations.forEach((m) => console.log(`  - ${m.migration_name} (${m.finished_at.toISOString()})`));
    } catch (e) {
      console.log(`${colors.red}✗ Could not read migrations table${colors.reset}`);
    }

    console.log('');

    // Test 6: Write Test
    console.log(`${colors.yellow}Test 6: Write Permission Test${colors.reset}`);
    try {
      // Try to create and delete a test capture session
      const testSession = await prisma.captureSession.create({
        data: {
          channelId: 'test-connection-' + Date.now(),
          channelName: 'Test Channel',
          totalVouches: 0,
          startedBy: 'test-user',
        },
      });
      
      await prisma.captureSession.delete({
        where: { id: testSession.id },
      });
      
      console.log(`${colors.green}✓ Write permissions working${colors.reset}\n`);
    } catch (e) {
      console.log(`${colors.red}✗ Write permissions failed: ${e}${colors.reset}\n`);
    }

    // Final Summary
    console.log(`${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.green}✅ All tests completed successfully!${colors.reset}`);
    console.log(`${colors.cyan}========================================${colors.reset}\n`);
    
    console.log(`${colors.blue}Database URL:${colors.reset}`);
    console.log(`  ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Database connection failed:${colors.reset}`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log(`${colors.yellow}📡 Disconnected from database${colors.reset}`);
  }
}

// Run the test
testDatabaseConnection()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
