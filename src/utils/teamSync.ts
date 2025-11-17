import { Client, Events } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Team member configurations
const TEAM_CONFIG = {
  FOUNDER_ID: '959653911923396629',
  OWNER_IDS: ['643480211421265930', '283127777383809024'],
  GIRL_OWNER_IDS: ['671775289252118528', '965996958466605056'],
  MANAGER_IDS: ['785398118095126570', '1255565188829155388', '1391157574958710835', '930109353137176586'],
  EARLY_SUPPORT_ROLE_ID: '1395736628793839646',
  GUILD_ID: '449751480375705601', // EXE Server ID
};

// Sync interval: 30 seconds for real-time updates (24/7)
const SYNC_INTERVAL = 30 * 1000;

export async function syncTeamMembers(client: Client) {
  const startTime = Date.now();
  
  try {
    console.log('[Team Sync] Starting team member sync...');
    
    const guild = await client.guilds.fetch(TEAM_CONFIG.GUILD_ID);
    if (!guild) {
      console.error('[Team Sync] Could not find EXE server.');
      return;
    }

    // Get existing team members to avoid unnecessary updates
    const existingMembers = await prisma.teamMember.findMany({
      select: { userId: true, username: true, avatarUrl: true, role: true }
    });
    const existingMap = new Map(existingMembers.map(m => [m.userId, m]));

    const counters = { synced: 0, skipped: 0, errors: 0 };
    const operations: Promise<any>[] = [];

    // Sync Founder (parallel)
    operations.push(
      guild.members.fetch(TEAM_CONFIG.FOUNDER_ID).then(async (founder) => {
        const existing = existingMap.get(TEAM_CONFIG.FOUNDER_ID);
        const avatarUrl = founder.user.displayAvatarURL({ size: 1024 });
        
        if (existing?.username === founder.user.username && existing?.avatarUrl === avatarUrl) {
          counters.skipped++;
          return;
        }

        await prisma.teamMember.upsert({
          where: { userId: TEAM_CONFIG.FOUNDER_ID },
          update: { username: founder.user.username, avatarUrl, role: 'Founder', order: 0 },
          create: { userId: TEAM_CONFIG.FOUNDER_ID, username: founder.user.username, avatarUrl, role: 'Founder', order: 0 },
        });
        counters.synced++;
      }).catch((error) => {
        console.error('[Team Sync] Error syncing founder:', error);
        counters.errors++;
      })
    );

    // Sync Owners (parallel)
    TEAM_CONFIG.OWNER_IDS.forEach((ownerId, i) => {
      operations.push(
        guild.members.fetch(ownerId).then(async (owner) => {
          const existing = existingMap.get(ownerId);
          const avatarUrl = owner.user.displayAvatarURL({ size: 1024 });
          
          if (existing?.username === owner.user.username && existing?.avatarUrl === avatarUrl) {
            counters.skipped++;
            return;
          }

          await prisma.teamMember.upsert({
            where: { userId: ownerId },
            update: { username: owner.user.username, avatarUrl, role: 'Owner', order: i },
            create: { userId: ownerId, username: owner.user.username, avatarUrl, role: 'Owner', order: i },
          });
          counters.synced++;
        }).catch((error) => {
          console.error(`[Team Sync] Error syncing owner ${ownerId}:`, error);
          counters.errors++;
        })
      );
    });

    // Sync Girl Owners (parallel)
    TEAM_CONFIG.GIRL_OWNER_IDS.forEach((girlOwnerId, i) => {
      operations.push(
        guild.members.fetch(girlOwnerId).then(async (girlOwner) => {
          const existing = existingMap.get(girlOwnerId);
          const avatarUrl = girlOwner.user.displayAvatarURL({ size: 1024 });
          
          if (existing?.username === girlOwner.user.username && existing?.avatarUrl === avatarUrl) {
            counters.skipped++;
            return;
          }

          await prisma.teamMember.upsert({
            where: { userId: girlOwnerId },
            update: { username: girlOwner.user.username, avatarUrl, role: 'GirlOwner', order: i },
            create: { userId: girlOwnerId, username: girlOwner.user.username, avatarUrl, role: 'GirlOwner', order: i },
          });
          counters.synced++;
        }).catch((error) => {
          console.error(`[Team Sync] Error syncing girl owner ${girlOwnerId}:`, error);
          counters.errors++;
        })
      );
    });

    // Sync Managers (parallel)
    TEAM_CONFIG.MANAGER_IDS.forEach((managerId, i) => {
      operations.push(
        guild.members.fetch(managerId).then(async (manager) => {
          const existing = existingMap.get(managerId);
          const avatarUrl = manager.user.displayAvatarURL({ size: 1024 });
          
          if (existing?.username === manager.user.username && existing?.avatarUrl === avatarUrl) {
            counters.skipped++;
            return;
          }

          await prisma.teamMember.upsert({
            where: { userId: managerId },
            update: { username: manager.user.username, avatarUrl, role: 'Manager', order: i },
            create: { userId: managerId, username: manager.user.username, avatarUrl, role: 'Manager', order: i },
          });
          counters.synced++;
        }).catch((error) => {
          console.error(`[Team Sync] Error syncing manager ${managerId}:`, error);
          counters.errors++;
        })
      );
    });

    // Wait for core team
    await Promise.all(operations);

    // Sync Early Supporters
    try {
      // Fetch role from guild
      const role = await guild.roles.fetch(TEAM_CONFIG.EARLY_SUPPORT_ROLE_ID);
      
      if (!role) {
        console.log('[Team Sync] Early Support role not found');
        return;
      }

      // Fetch all guild members first
      await guild.members.fetch();
      
      // Get members with the role, excluding core team members
      const allCoreTeamIds = [
        TEAM_CONFIG.FOUNDER_ID,
        ...TEAM_CONFIG.OWNER_IDS,
        ...TEAM_CONFIG.MANAGER_IDS
      ];
      
      const earlySupporters = role.members.filter(member => 
        !allCoreTeamIds.includes(member.id)
      );

      const currentSupporterIds = Array.from(earlySupporters.keys()) as string[];
      
      if (currentSupporterIds.length > 0) {
        await prisma.teamMember.deleteMany({
          where: {
            role: 'EarlySupport',
            userId: { notIn: currentSupporterIds },
          },
        });
      } else {
        await prisma.teamMember.deleteMany({
          where: { role: 'EarlySupport' },
        });
      }

      const supporterOps: Promise<any>[] = [];
      let order = 0;
      
      for (const [userId, member] of earlySupporters) {
        const existing = existingMap.get(userId);
        const avatarUrl = member.user.displayAvatarURL({ size: 1024 });
        
        if (existing?.username === member.user.username && existing?.avatarUrl === avatarUrl && existing?.role === 'EarlySupport') {
          counters.skipped++;
          order++;
          continue;
        }

        supporterOps.push(
          prisma.teamMember.upsert({
            where: { userId },
            update: { username: member.user.username, avatarUrl, role: 'EarlySupport', order },
            create: { userId, username: member.user.username, avatarUrl, role: 'EarlySupport', order },
          }).then(() => counters.synced++)
        );
        order++;
      }

      await Promise.all(supporterOps);
    } catch (error) {
      console.error('[Team Sync] Error syncing early supporters:', error);
      counters.errors++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Team Sync] ✅ Synced ${counters.synced}, skipped ${counters.skipped}, errors ${counters.errors} (${elapsed}s)`);
  } catch (error) {
    console.error('[Team Sync] Error during sync:', error);
  }
}

export function setupTeamSync(client: Client) {
  // Initial sync on bot ready
  client.once(Events.ClientReady, async () => {
    console.log('[Team Sync] Bot ready, performing initial sync...');
    await syncTeamMembers(client);
    
    // Set up periodic sync
    setInterval(() => {
      syncTeamMembers(client);
    }, SYNC_INTERVAL);
    
    console.log(`[Team Sync] ✅ 24/7 Auto-sync enabled (every ${SYNC_INTERVAL / 1000} seconds)`);
    console.log(`[Team Sync] 🔄 Real-time profile updates: ACTIVE`);
  });

  // Sync on member role updates and profile changes (real-time)
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (newMember.guild.id !== TEAM_CONFIG.GUILD_ID) return;
    
    const hadRole = oldMember.roles.cache.has(TEAM_CONFIG.EARLY_SUPPORT_ROLE_ID);
    const hasRole = newMember.roles.cache.has(TEAM_CONFIG.EARLY_SUPPORT_ROLE_ID);
    
    // Check if this is a team member
    const isTeamMember = [
      TEAM_CONFIG.FOUNDER_ID,
      ...TEAM_CONFIG.OWNER_IDS,
      ...TEAM_CONFIG.MANAGER_IDS,
    ].includes(newMember.id) || hasRole;
    
    // Detect username change
    const usernameChanged = oldMember.user.username !== newMember.user.username;
    
    // Detect avatar change
    const oldAvatar = oldMember.user.displayAvatarURL({ size: 1024 });
    const newAvatar = newMember.user.displayAvatarURL({ size: 1024 });
    const avatarChanged = oldAvatar !== newAvatar;
    
    // If Early Support role was added or removed, or profile changed for team member
    if (hadRole !== hasRole || (isTeamMember && (usernameChanged || avatarChanged))) {
      if (usernameChanged) {
        console.log(`[Team Sync] 👤 Username changed: ${oldMember.user.username} → ${newMember.user.username}, syncing...`);
      }
      if (avatarChanged) {
        console.log(`[Team Sync] 🖼️  Avatar changed for ${newMember.user.username}, syncing...`);
      }
      if (hadRole !== hasRole) {
        console.log(`[Team Sync] Role change detected for ${newMember.user.username}, syncing...`);
      }
      await syncTeamMembers(client);
    }
  });

  // Sync on member leave
  client.on(Events.GuildMemberRemove, async (member) => {
    if (member.guild.id !== TEAM_CONFIG.GUILD_ID) return;
    
    if (member.roles.cache.has(TEAM_CONFIG.EARLY_SUPPORT_ROLE_ID)) {
      console.log(`[Team Sync] Member with Early Support role left: ${member.user.username}, syncing...`);
      await syncTeamMembers(client);
    }
  });
  
  // Sync on user profile updates (username, avatar, etc.)
  client.on(Events.UserUpdate, async (oldUser, newUser) => {
    // Check if this user is a team member
    const isTeamMember = [
      TEAM_CONFIG.FOUNDER_ID,
      ...TEAM_CONFIG.OWNER_IDS,
      ...TEAM_CONFIG.MANAGER_IDS,
    ].includes(newUser.id);
    
    if (!isTeamMember) return;
    
    // Detect changes
    const usernameChanged = oldUser.username !== newUser.username;
    const avatarChanged = oldUser.displayAvatarURL({ size: 1024 }) !== newUser.displayAvatarURL({ size: 1024 });
    
    if (usernameChanged || avatarChanged) {
      if (usernameChanged) {
        console.log(`[Team Sync] 👤 Core team username changed: ${oldUser.username} → ${newUser.username}`);
      }
      if (avatarChanged) {
        console.log(`[Team Sync] 🖼️  Core team avatar changed: ${newUser.username}`);
      }
      console.log(`[Team Sync] 🌐 Updating website automatically...`);
      await syncTeamMembers(client);
    }
  });
}
