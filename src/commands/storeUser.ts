import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  Message,
  ChannelType,
} from 'discord.js';
import { prisma } from '../database';

interface UserData {
  userId: string;
  username: string;
  avatarUrl: string;
  messageCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

export const storeUserCommand = {
  data: new SlashCommandBuilder()
    .setName('store-user')
    .setDescription('Collect and store user IDs from a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to collect users from')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    // Check if user is admin
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const targetChannel = interaction.options.getChannel('channel', true);

    if (targetChannel.type !== ChannelType.GuildText) {
      await interaction.editReply('❌ Please select a text channel.');
      return;
    }

    const channel = targetChannel as TextChannel;

    try {
      await interaction.editReply(`🔄 Starting to collect user IDs from ${channel}...`);

      // Fetch all messages from the channel
      const allMessages: Message[] = [];
      let lastMessageId: string | undefined;

      while (true) {
        const options: { limit: number; before?: string } = { limit: 100 };
        if (lastMessageId) {
          options.before = lastMessageId;
        }

        const messages = await channel.messages.fetch(options);
        
        if (messages.size === 0) break;

        allMessages.push(...messages.values());
        lastMessageId = messages.last()?.id;

        // Update progress
        if (allMessages.length % 100 === 0) {
          await interaction.editReply(
            `🔄 Collecting user data... ${allMessages.length} messages scanned so far.`
          );
        }
      }

      // Sort messages by timestamp (oldest first)
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Process messages and collect unique users
      const userMap = new Map<string, UserData>();

      for (const msg of allMessages) {
        // Skip bot messages
        if (msg.author.bot) continue;

        const userId = msg.author.id;
        const existingData = userMap.get(userId);

        if (existingData) {
          // Update existing user data
          existingData.messageCount++;
          existingData.lastSeen = msg.createdAt;
        } else {
          // Create new user data - use displayName (globalName) or fallback to username
          const displayName = msg.author.globalName || msg.author.username;
          userMap.set(userId, {
            userId: msg.author.id,
            username: displayName,
            avatarUrl: msg.author.displayAvatarURL(),
            messageCount: 1,
            firstSeen: msg.createdAt,
            lastSeen: msg.createdAt,
          });
        }
      }

      const uniqueUsers = Array.from(userMap.values());

      await interaction.editReply(
        `✅ Processing complete!\n` +
        `📊 Total messages: ${allMessages.length}\n` +
        `👥 Unique users found: ${uniqueUsers.length}\n\n` +
        `💾 Storing user IDs in database...`
      );

      // Store user IDs in the database
      let storedCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      for (const userData of uniqueUsers) {
        try {
          // Try to find existing user in Vouch table
          const existingVouch = await prisma.vouch.findFirst({
            where: { authorId: userData.userId },
            orderBy: { timestamp: 'desc' },
          });

          if (existingVouch) {
            // User exists, update their info
            await prisma.vouch.updateMany({
              where: { authorId: userData.userId },
              data: {
                authorName: userData.username,
                authorAvatar: userData.avatarUrl,
              },
            });
            updatedCount++;
          } else {
            // User doesn't exist, create a placeholder vouch record
            await prisma.vouch.create({
              data: {
                vouchNumber: await getNextVouchNumber(),
                channelId: channel.id,
                channelName: channel.name,
                authorId: userData.userId,
                authorName: userData.username,
                authorAvatar: userData.avatarUrl,
                message: `[User stored via /store-user command - ${userData.messageCount} messages in ${channel.name}]`,
                messageId: `stored_${userData.userId}_${Date.now()}`,
                timestamp: userData.firstSeen,
                attachments: [],
              },
            });
            storedCount++;
          }
        } catch (error: any) {
          console.error(`❌ Error storing user ${userData.username}:`, error.message);
          errorCount++;
        }

        // Update progress every 10 users
        if ((storedCount + updatedCount) % 10 === 0) {
          await interaction.editReply(
            `💾 Storing user IDs... ${storedCount + updatedCount}/${uniqueUsers.length}`
          );
        }
      }

      // Calculate statistics
      const topContributors = uniqueUsers
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, 5)
        .map(u => `${u.username}: ${u.messageCount} messages`)
        .join('\n');

      // Create summary embed
      const summaryEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('👥 User Storage Complete')
        .setDescription(`Successfully processed users from ${channel}`)
        .addFields(
          { name: '📊 Total Messages', value: allMessages.length.toString(), inline: true },
          { name: '👥 Unique Users', value: uniqueUsers.length.toString(), inline: true },
          { name: '💾 New Users Stored', value: storedCount.toString(), inline: true },
          { name: '🔄 Existing Users Updated', value: updatedCount.toString(), inline: true },
          { name: '❌ Errors', value: errorCount.toString(), inline: true },
          { name: '🏆 Top Contributors', value: topContributors || 'None', inline: false }
        )
        .setFooter({ text: `Channel: ${channel.name}` })
        .setTimestamp();

      await interaction.editReply({
        content: '✅ User storage completed!',
        embeds: [summaryEmbed],
      });

      console.log(`✅ Store-user completed: ${storedCount} new, ${updatedCount} updated, ${errorCount} errors`);
    } catch (error) {
      console.error('Error storing user IDs:', error);
      await interaction.editReply('❌ An error occurred while collecting user IDs. Please check the bot permissions and try again.');
    }
  },
};

// Helper function to get next vouch number
async function getNextVouchNumber(): Promise<number> {
  const maxVouchNumber = await prisma.vouch.aggregate({
    _max: {
      vouchNumber: true,
    },
  });
  return (maxVouchNumber._max.vouchNumber || 0) + 1;
}
