import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, Message } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Team member configurations
const TEAM_CONFIG = {
  FOUNDER_ID: '959653911923396629',
  OWNER_IDS: ['643480211421265930', '283127777383809024'],
  GIRL_OWNER_IDS: ['671775289252118528', '965996958466605056'],
  MANAGER_IDS: ['785398118095126570', '1255565188829155388', '1391157574958710835', '930109353137176586'],
  EARLY_SUPPORT_ROLE_ID: '1395736628793839646',
  GUILD_ID: '449751480375705601', 
};

// Monitoring state
let isMonitoringEnabled = false;
let liveMonitorMessage: Message | null = null;
let liveMonitorInterval: NodeJS.Timeout | null = null;

export const data = new SlashCommandBuilder()
  .setName('synctream')
  .setDescription('Toggle real-time team monitoring')
  .addSubcommand(subcommand =>
    subcommand
      .setName('enable')
      .setDescription('Enable real-time team monitoring with live embed'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('disable')
      .setDescription('Disable real-time team monitoring'))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export function isMonitoring(): boolean {
  return isMonitoringEnabled;
}

async function getTeamStats() {
  const teamMembers = await prisma.teamMember.findMany({
    orderBy: [{ order: 'asc' }],
  });

  const grouped = {
    founder: teamMembers.filter(m => m.role === 'Founder'),
    owners: teamMembers.filter(m => m.role === 'Owner'),
    girlOwners: teamMembers.filter(m => m.role === 'Girl Owner'),
    managers: teamMembers.filter(m => m.role === 'Manager'),
    earlySupport: teamMembers.filter(m => m.role === 'Early Support'),
  };

  return grouped;
}

function createStatsEmbed(stats: Awaited<ReturnType<typeof getTeamStats>>, lastUpdate: Date) {
  const embed = new EmbedBuilder()
    .setColor(0xc9a76f)
    .setTitle('📊 Team Statistics - Live Monitor')
    .setDescription('Real-time team member counts updating every 10 seconds')
    .addFields(
      { name: '👑 Founders', value: `\`${stats.founder.length}\``, inline: true },
      { name: '🔱 Owners', value: `\`${stats.owners.length}\``, inline: true },
      { name: '💖 Girl Owners', value: `\`${stats.girlOwners.length}\``, inline: true },
      { name: '⚙️ Managers', value: `\`${stats.managers.length}\``, inline: true },
      { name: '🌟 Early Support', value: `\`${stats.earlySupport.length}\``, inline: true },
      { name: '📈 Total', value: `\`${stats.founder.length + stats.owners.length + stats.girlOwners.length + stats.managers.length + stats.earlySupport.length}\``, inline: true },
    )
    .setFooter({ text: `Last Update: ${lastUpdate.toLocaleString('en-US', { timeZone: 'UTC', hour12: true })}` })
    .setTimestamp();

  return embed;
}

function createUpdateButton() {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('update_team_stats')
        .setLabel('🔄 Update Now')
        .setStyle(ButtonStyle.Primary)
    );
  return row;
}

async function updateLiveMonitor() {
  if (!liveMonitorMessage) return;

  try {
    const stats = await getTeamStats();
    const embed = createStatsEmbed(stats, new Date());
    const button = createUpdateButton();

    await liveMonitorMessage.edit({ embeds: [embed], components: [button] });
  } catch (error) {
    console.error('[Live Monitor] Error updating:', error);
  }
}

export async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (interaction.customId === 'update_team_stats') {
    await interaction.deferUpdate();
    await updateLiveMonitor();
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'enable') {
    isMonitoringEnabled = true;

    // Stop existing interval if any
    if (liveMonitorInterval) {
      clearInterval(liveMonitorInterval);
    }

    // Get initial stats
    const stats = await getTeamStats();
    const embed = createStatsEmbed(stats, new Date());
    const button = createUpdateButton();

    // Send the live monitor message
    const message = await interaction.reply({ 
      embeds: [embed], 
      components: [button],
      fetchReply: true 
    });

    liveMonitorMessage = message as Message;

    // Set up auto-update every 10 seconds
    liveMonitorInterval = setInterval(async () => {
      await updateLiveMonitor();
    }, 10000); // 10 seconds

    console.log('[Live Monitor] ✅ Enabled - Updating every 10 seconds');
    return;

  } else if (subcommand === 'disable') {
    isMonitoringEnabled = false;

    // Stop the interval
    if (liveMonitorInterval) {
      clearInterval(liveMonitorInterval);
      liveMonitorInterval = null;
    }

    // Clear the message reference
    liveMonitorMessage = null;

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🛑 Monitoring Disabled')
      .setDescription('Real-time monitoring has been turned off.\nThe live stats embed will no longer update.')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log('[Live Monitor] 🛑 Disabled');
    return;
  }

  const startTime = Date.now();
  
  try {
    await interaction.deferReply({ flags: ['Ephemeral'] });
    
    await interaction.editReply('🔄 **Syncing team members...**\n⏳ Fetching guild data...');

    const guild = await interaction.client.guilds.fetch(TEAM_CONFIG.GUILD_ID);
    if (!guild) {
      return interaction.editReply('❌ Could not find EXE server.');
    }

    const existingMembers = await prisma.teamMember.findMany({
      select: { userId: true, username: true, avatarUrl: true, role: true }
    });
    const existingMap = new Map(existingMembers.map(m => [m.userId, m]));

    const counters = { founder: 0, owners: 0, managers: 0, earlySupport: 0, skipped: 0, errors: 0 };

    // Process Founder
    await interaction.editReply('🔄 **Syncing team members...**\n⏳ Processing founder (1/1)...');
    try {
      const founder = await guild.members.fetch(TEAM_CONFIG.FOUNDER_ID);
      const existing = existingMap.get(TEAM_CONFIG.FOUNDER_ID);
      const avatarUrl = founder.user.displayAvatarURL({ size: 1024 });
      
      if (existing?.username === founder.user.username && existing?.avatarUrl === avatarUrl && existing?.role === 'Founder') {
        counters.skipped++;
      } else {
        await prisma.teamMember.upsert({
          where: { userId: TEAM_CONFIG.FOUNDER_ID },
          update: { username: founder.user.username, avatarUrl, role: 'Founder', order: 0 },
          create: { userId: TEAM_CONFIG.FOUNDER_ID, username: founder.user.username, avatarUrl, role: 'Founder', order: 0 },
        });
        counters.founder++;
      }
    } catch (error) {
      console.error('Error syncing founder:', error);
      counters.errors++;
    }

    // Process Owners one by one
    for (let i = 0; i < TEAM_CONFIG.OWNER_IDS.length; i++) {
      await interaction.editReply(`🔄 **Syncing team members...**\n⏳ Processing owner (${i + 1}/${TEAM_CONFIG.OWNER_IDS.length})...`);
      const ownerId = TEAM_CONFIG.OWNER_IDS[i];
      
      try {
        const owner = await guild.members.fetch(ownerId);
        const existing = existingMap.get(ownerId);
        const avatarUrl = owner.user.displayAvatarURL({ size: 1024 });
        
        if (existing?.username === owner.user.username && existing?.avatarUrl === avatarUrl && existing?.role === 'Owner') {
          counters.skipped++;
        } else {
          await prisma.teamMember.upsert({
            where: { userId: ownerId },
            update: { username: owner.user.username, avatarUrl, role: 'Owner', order: i },
            create: { userId: ownerId, username: owner.user.username, avatarUrl, role: 'Owner', order: i },
          });
          counters.owners++;
        }
      } catch (error) {
        console.error(`Error syncing owner ${ownerId}:`, error);
        counters.errors++;
      }
    }

    // Process Girl Owners one by one
    for (let i = 0; i < TEAM_CONFIG.GIRL_OWNER_IDS.length; i++) {
      await interaction.editReply(`🔄 **Syncing team members...**\n⏳ Processing girl owner (${i + 1}/${TEAM_CONFIG.GIRL_OWNER_IDS.length})...`);
      const girlOwnerId = TEAM_CONFIG.GIRL_OWNER_IDS[i];
      
      try {
        const girlOwner = await guild.members.fetch(girlOwnerId);
        const existing = existingMap.get(girlOwnerId);
        const avatarUrl = girlOwner.user.displayAvatarURL({ size: 1024 });
        
        if (existing?.username === girlOwner.user.username && existing?.avatarUrl === avatarUrl && existing?.role === 'Girl Owner') {
          counters.skipped++;
        } else {
          await prisma.teamMember.upsert({
            where: { userId: girlOwnerId },
            update: { username: girlOwner.user.username, avatarUrl, role: 'Girl Owner', order: i },
            create: { userId: girlOwnerId, username: girlOwner.user.username, avatarUrl, role: 'Girl Owner', order: i },
          });
          counters.owners++;
        }
      } catch (error) {
        console.error(`Error syncing girl owner ${girlOwnerId}:`, error);
        counters.errors++;
      }
    }

    // Process Managers one by one
    for (let i = 0; i < TEAM_CONFIG.MANAGER_IDS.length; i++) {
      await interaction.editReply(`🔄 **Syncing team members...**\n⏳ Processing manager (${i + 1}/${TEAM_CONFIG.MANAGER_IDS.length})...`);
      const managerId = TEAM_CONFIG.MANAGER_IDS[i];
      
      try {
        const manager = await guild.members.fetch(managerId);
        const existing = existingMap.get(managerId);
        const avatarUrl = manager.user.displayAvatarURL({ size: 1024 });
        
        if (existing?.username === manager.user.username && existing?.avatarUrl === avatarUrl && existing?.role === 'Manager') {
          counters.skipped++;
        } else {
          await prisma.teamMember.upsert({
            where: { userId: managerId },
            update: { username: manager.user.username, avatarUrl, role: 'Manager', order: i },
            create: { userId: managerId, username: manager.user.username, avatarUrl, role: 'Manager', order: i },
          });
          counters.managers++;
        }
      } catch (error) {
        console.error(`Error syncing manager ${managerId}:`, error);
        counters.errors++;
      }
    }

    // Process Early Supporters
    await interaction.editReply('🔄 **Syncing team members...**\n⏳ Fetching early supporters...');
    
    try {
      // Fetch role from guild
      const role = await guild.roles.fetch(TEAM_CONFIG.EARLY_SUPPORT_ROLE_ID);
      
      if (!role) {
        console.log('[Team Sync] Early Support role not found');
      } else {
        // Fetch all guild members first
        await guild.members.fetch();
        
        // Get members with the role, excluding core team members
        const allCoreTeamIds = [
          TEAM_CONFIG.FOUNDER_ID,
          ...TEAM_CONFIG.OWNER_IDS,
          ...TEAM_CONFIG.GIRL_OWNER_IDS,
          ...TEAM_CONFIG.MANAGER_IDS
        ];
        
        const earlySupporters = role.members.filter(member => 
          !allCoreTeamIds.includes(member.id)
        );

        await interaction.editReply(`🔄 **Syncing team members...**\n✅ Found ${earlySupporters.size} early supporters`);

        const currentSupporterIds = Array.from(earlySupporters.keys()) as string[];
        
        // Remove supporters who lost the role
        if (currentSupporterIds.length > 0) {
          await prisma.teamMember.deleteMany({
            where: {
              role: 'Early Support',
              userId: { notIn: currentSupporterIds },
            },
          });
        } else {
          // No early supporters, remove all
          await prisma.teamMember.deleteMany({
            where: { role: 'Early Support' },
          });
        }

        // Process each supporter one by one
        let order = 0;
        let processed = 0;
        const total = earlySupporters.size;
        
        for (const [userId, member] of earlySupporters) {
          processed++;
          await interaction.editReply(`🔄 **Syncing team members...**\n⏳ Processing early supporter (${processed}/${total})...`);
          
          const existing = existingMap.get(userId);
          const avatarUrl = member.user.displayAvatarURL({ size: 1024 });
          
          if (existing?.username === member.user.username && existing?.avatarUrl === avatarUrl && existing?.role === 'Early Support') {
            counters.skipped++;
          } else {
            try {
              await prisma.teamMember.upsert({
                where: { userId },
                update: { username: member.user.username, avatarUrl, role: 'Early Support', order },
                create: { userId, username: member.user.username, avatarUrl, role: 'Early Support', order },
              });
              counters.earlySupport++;
            } catch (error) {
              console.error(`Error syncing supporter ${userId}:`, error);
              counters.errors++;
            }
          }
          order++;
        }
      }
    } catch (error) {
      console.error('Error syncing early supporters:', error);
      await interaction.editReply(`🔄 **Syncing team members...**\n⚠️ Error fetching early supporters: ${error instanceof Error ? error.message : 'Unknown error'}`);
      counters.errors++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const totalSynced = counters.founder + counters.owners + counters.managers + counters.earlySupport;

    await interaction.editReply(
      `✅ **Successfully synced team members!**\n\n` +
      `📊 **Breakdown:**\n` +
      `• Founder: ${counters.founder > 0 ? '✅' : '⏭️'} ${counters.founder ? 'Updated' : 'Already synced'}\n` +
      `• Owners: ${counters.owners > 0 ? `✅ ${counters.owners} updated` : `⏭️ ${TEAM_CONFIG.OWNER_IDS.length} already synced`}\n` +
      `• Managers: ${counters.managers > 0 ? `✅ ${counters.managers} updated` : `⏭️ ${TEAM_CONFIG.MANAGER_IDS.length} already synced`}\n` +
      `• Early Supporters: ${counters.earlySupport > 0 ? `✅ ${counters.earlySupport} updated` : '⏭️ All already synced'}\n` +
      `• Skipped (up-to-date): ${counters.skipped}\n` +
      `${counters.errors > 0 ? `• ⚠️ Errors: ${counters.errors}\n` : ''}` +
      `\n⚡ **Total synced:** ${totalSynced}\n` +
      `⏱️ **Completed in:** ${elapsed}s\n\n` +
      `🔄 **Auto-sync Status:** ACTIVE (24/7 every 30s)\n` +
      `🌐 **Real-time updates:** Username & Avatar changes sync automatically`
    );
  } catch (error) {
    console.error('Error in syncteam command:', error);
    await interaction.editReply('❌ An error occurred while syncing team members.');
  }
}
