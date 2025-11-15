import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  Collection,
  Message,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { prisma } from '../database';

interface CapturedData {
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  message: string;
  messageId: string;
  timestamp: Date;
  attachments: string[];
}

let capturedDataCache: Map<string, {
  channelId: string;
  channelName: string;
  data: CapturedData[];
  sessionId: string;
  userId: string;
}> = new Map();

export const captureDataCommand = {
  data: new SlashCommandBuilder()
    .setName('capture-data')
    .setDescription('Capture all messages from a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to capture data from')
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
      await interaction.editReply(`🔄 Starting to capture data from ${channel}...`);

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
            `🔄 Capturing data... ${allMessages.length} messages collected so far.`
          );
        }
      }

      // Sort messages by timestamp (oldest first)
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Process and structure the data
      const capturedData: CapturedData[] = allMessages.map((msg) => ({
        authorId: msg.author.id,
        authorName: msg.author.tag,
        authorAvatar: msg.author.displayAvatarURL(),
        message: msg.content || '[No text content]',
        messageId: msg.id,
        timestamp: msg.createdAt,
        attachments: msg.attachments.map((att) => att.url),
      }));

      // Create capture session in database
      const session = await prisma.captureSession.create({
        data: {
          channelId: channel.id,
          channelName: channel.name,
          totalVouches: capturedData.length,
          startedBy: interaction.user.id,
        },
      });

      // Store in cache for later push to database
      capturedDataCache.set(session.id, {
        channelId: channel.id,
        channelName: channel.name,
        data: capturedData,
        sessionId: session.id,
        userId: interaction.user.id,
      });
      
      console.log(`💾 Cached session: ${session.id} for user: ${interaction.user.id}`);
      console.log(`📦 Cache now has ${capturedDataCache.size} entries`);

      // Calculate statistics
      const uniqueAuthors = new Set(capturedData.map((d) => d.authorId)).size;
      const messagesWithAttachments = capturedData.filter(
        (d) => d.attachments.length > 0
      ).length;
      
      // Get top authors
      const authorCounts: { [key: string]: { name: string; count: number } } = {};
      capturedData.forEach((d) => {
        if (!authorCounts[d.authorId]) {
          authorCounts[d.authorId] = { name: d.authorName, count: 0 };
        }
        authorCounts[d.authorId].count++;
      });
      
      const topAuthors = Object.entries(authorCounts)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 5)
        .map(([, data]) => `${data.name}: ${data.count}`)
        .join('\n');

      // Create summary embed
      const summaryEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📊 Data Collection Summary')
        .setDescription(`Successfully captured data from ${channel}`)
        .addFields(
          { name: '📝 Total Messages', value: capturedData.length.toString(), inline: true },
          { name: '👥 Unique Authors', value: uniqueAuthors.toString(), inline: true },
          { name: '📎 Messages with Attachments', value: messagesWithAttachments.toString(), inline: true },
          { name: '🏆 Top Contributors', value: topAuthors || 'None', inline: false },
          {
            name: '📅 Date Range',
            value: capturedData.length > 0
              ? `${capturedData[0].timestamp.toLocaleDateString()} - ${capturedData[capturedData.length - 1].timestamp.toLocaleDateString()}`
              : 'N/A',
            inline: false,
          }
        )
        .setFooter({ text: 'Click "Add to Database" to save this data permanently' })
        .setTimestamp();

      // Create action buttons
      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`add_to_db_${session.id}`)
            .setLabel('Add to Database')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💾'),
          new ButtonBuilder()
            .setCustomId(`cancel_${session.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );

      await interaction.editReply({
        content: '✅ Data capture completed!',
        embeds: [summaryEmbed],
        components: [actionRow],
      });
    } catch (error) {
      console.error('Error capturing data:', error);
      await interaction.editReply('❌ An error occurred while capturing data. Please check the bot permissions and try again.');
    }
  },
};

// Handle button interactions for adding to database or canceling
export async function handleButtonInteraction(interaction: ButtonInteraction) {
  const { customId } = interaction;
  
  // Parse the button customId correctly
  // Format: "add_to_db_SESSION_ID" or "cancel_SESSION_ID"
  let action: string;
  let fullSessionId: string;
  
  if (customId.startsWith('add_to_db_')) {
    action = 'add';
    fullSessionId = customId.replace('add_to_db_', '');
  } else if (customId.startsWith('cancel_')) {
    action = 'cancel';
    fullSessionId = customId.replace('cancel_', '');
  } else {
    console.error('Unknown button customId:', customId);
    await interaction.reply({
      content: '❌ Unknown button action.',
      ephemeral: true,
    });
    return;
  }
  
  console.log(`📋 Parsed button - Action: ${action}, Session ID: ${fullSessionId}`);
  console.log(`📦 Cache has ${capturedDataCache.size} entries`);
  console.log(`🔍 Looking for session: ${fullSessionId}`);
  
  if (action === 'cancel') {
    // Cancel operation
    const cachedData = capturedDataCache.get(fullSessionId);
    
    if (cachedData && cachedData.userId === interaction.user.id) {
      capturedDataCache.delete(fullSessionId);
      
      // Update session as not pushed
      await prisma.captureSession.update({
        where: { id: fullSessionId },
        data: { 
          summary: 'Operation cancelled by user',
          completedAt: new Date(),
        },
      });
      
      const cancelEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Operation Cancelled')
        .setDescription('The data capture operation has been cancelled. No data was saved to the database.')
        .setTimestamp();
      
      await interaction.update({
        content: '❌ Operation cancelled',
        embeds: [cancelEmbed],
        components: [],
      });
    } else {
      await interaction.reply({
        content: '❌ No active capture session found or session expired.',
        ephemeral: true,
      });
    }
    return;
  }
  
  if (action === 'add') {
    // Add to database with real-time progress
    const cachedData = capturedDataCache.get(fullSessionId);
    
    console.log(`🔎 Cache lookup result:`, cachedData ? 'FOUND' : 'NOT FOUND');
    if (cachedData) {
      console.log(`👤 User match: ${cachedData.userId} === ${interaction.user.id} ? ${cachedData.userId === interaction.user.id}`);
    }
    
    if (!cachedData || cachedData.userId !== interaction.user.id) {
      await interaction.reply({
        content: '❌ No capture session found or session expired. Please run `/capture-data` again.',
        ephemeral: true,
      });
      return;
    }
    
    await interaction.deferUpdate();
    
    try {
      const { data, channelId, channelName, sessionId } = cachedData;
      const totalRecords = data.length;
      const batchSize = 50;
      let processed = 0;
      
      // Initial progress embed
      const progressEmbed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('💾 Adding Data to Database')
        .setDescription('Processing records...')
        .addFields(
          { name: '📊 Progress', value: `0 / ${totalRecords} (0%)`, inline: true },
          { name: '⏱️ Status', value: 'Starting...', inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({
        content: '🔄 Starting database operation...',
        embeds: [progressEmbed],
        components: [],
      });
      
      // Process in batches for real-time updates
      const startTime = Date.now();
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, Math.min(i + batchSize, data.length));
        
        await prisma.vouch.createMany({
          data: batch.map((item) => ({
            channelId: channelId,
            channelName: channelName,
            authorId: item.authorId,
            authorName: item.authorName,
            authorAvatar: item.authorAvatar,
            message: item.message,
            messageId: item.messageId,
            timestamp: item.timestamp,
            attachments: item.attachments,
          })),
          skipDuplicates: true,
        });
        
        processed += batch.length;
        const percentage = Math.round((processed / totalRecords) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Update progress
        const updatedProgressEmbed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('💾 Adding Data to Database')
          .setDescription('Processing records in real-time...')
          .addFields(
            { name: '📊 Progress', value: `${processed} / ${totalRecords} (${percentage}%)`, inline: true },
            { name: '⏱️ Elapsed Time', value: `${elapsed}s`, inline: true },
            { name: '📦 Batch', value: `${Math.ceil(processed / batchSize)} / ${Math.ceil(totalRecords / batchSize)}`, inline: true }
          )
          .setTimestamp();
        
        // Update every batch (throttled by Discord rate limits automatically)
        await interaction.editReply({
          content: `🔄 Processing... ${percentage}% complete`,
          embeds: [updatedProgressEmbed],
        });
      }
      
      // Update session as completed
      await prisma.captureSession.update({
        where: { id: sessionId },
        data: {
          completedAt: new Date(),
          isPushed: true,
          pushedAt: new Date(),
          summary: `Successfully pushed ${processed} vouches to database`,
        },
      });
      
      // Clear cache
      capturedDataCache.delete(fullSessionId);
      
      const finalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // Final success embed
      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Data Successfully Added to Database')
        .setDescription(`All captured messages have been saved to the database.`)
        .addFields(
          { name: '📝 Records Created', value: processed.toString(), inline: true },
          { name: '⏱️ Total Time', value: `${finalTime}s`, inline: true },
          { name: '📊 Channel', value: channelName, inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({
        content: '✅ Database operation completed!',
        embeds: [successEmbed],
      });
      
    } catch (error) {
      console.error('Error pushing to database:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Database Error')
        .setDescription('An error occurred while saving data to the database.')
        .setTimestamp();
      
      await interaction.editReply({
        content: '❌ Operation failed',
        embeds: [errorEmbed],
      });
    }
  }
}

export { capturedDataCache };
