// Script to initialize team members in the database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEAM_MEMBERS = {
  founder: {
    userId: '959653911923396629',
    username: 'imunknown69',
    avatarUrl: 'https://cdn.discordapp.com/avatars/959653911923396629/1a829abb7020436cbca22765be4e331b.png?size=1024',
    role: 'Founder',
    order: 0,
  },
  owners: [
    {
      userId: '643480211421265930',
      username: 'rex.f',
      avatarUrl: 'https://cdn.discordapp.com/avatars/643480211421265930/0ccf29cf250013d91b12dd21a149ca9c.png?size=1024',
      role: 'Owner',
      order: 0,
    },
    {
      userId: '283127777383809024',
      username: 'Alexx',
      avatarUrl: 'https://images-ext-1.discordapp.net/external/qUqtBKynxouMP3cfozPnjZFJ4kbxSPAv4H4ajaGABjY/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/283127777383809024/1b7166306a4eada744b9f5bc910b2f81.png?format=webp&quality=lossless&width=512&height=512',
      role: 'Owner',
      order: 1,
    },
  ],
  managers: [
    {
      userId: '785398118095126570',
      username: 'Damon',
      avatarUrl: null,
      role: 'Manager',
      order: 0,
    },
    {
      userId: '1255565188829155388',
      username: 'Devo',
      avatarUrl: null,
      role: 'Manager',
      order: 1,
    },
    {
      userId: '1391157574958710835',
      username: 'Mahad',
      avatarUrl: null,
      role: 'Manager',
      order: 2,
    },
    {
      userId: '930109353137176586',
      username: 'Kuchu',
      avatarUrl: null,
      role: 'Manager',
      order: 3,
    },
  ],
};

async function initializeTeamMembers() {
  console.log('Initializing team members...');

  try {
    // Add founder
    await prisma.teamMember.upsert({
      where: { userId: TEAM_MEMBERS.founder.userId },
      update: TEAM_MEMBERS.founder,
      create: TEAM_MEMBERS.founder,
    });
    console.log('✓ Founder added');

    // Add owners
    for (const owner of TEAM_MEMBERS.owners) {
      await prisma.teamMember.upsert({
        where: { userId: owner.userId },
        update: owner,
        create: owner,
      });
    }
    console.log('✓ Owners added');

    // Add managers
    for (const manager of TEAM_MEMBERS.managers) {
      await prisma.teamMember.upsert({
        where: { userId: manager.userId },
        update: manager,
        create: manager,
      });
    }
    console.log('✓ Managers added');

    console.log('\n✅ Team members initialized successfully!');
  } catch (error) {
    console.error('Error initializing team members:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

initializeTeamMembers();
