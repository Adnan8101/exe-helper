import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Test database connection
export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Successfully connected to PostgreSQL database');
    console.log('📊 Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));
    
    // Test query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔌 Disconnecting from database...');
  await prisma.$disconnect();
  console.log('✅ Database disconnected');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔌 Disconnecting from database...');
  await prisma.$disconnect();
  console.log('✅ Database disconnected');
  process.exit(0);
});
