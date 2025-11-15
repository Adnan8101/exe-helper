import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  TextChannel,
  Message,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  AttachmentBuilder,
} from 'discord.js';
import { prisma } from '../database';
import * as fs from 'fs';
import * as path from 'path';

interface CapturedProof {
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  message: string;
  messageId: string;
  timestamp: Date;
  imageUrl: string; // Single image URL per record
}

let capturedProofCache: Map<string, {
  channelId: string;
  channelName: string;
  data: CapturedProof[];
  sessionId: string;
  userId: string;
}> = new Map();

// Helper function to extract ALL image URLs from a message (including forwarded)
function extractImageUrls(message: Message): string[] {
  const imageUrls: string[] = [];
  
  // 1. Get ALL attachments (images and videos with thumbnails)
  message.attachments.forEach((attachment) => {
    // Add the main attachment URL
    if (attachment.url) {
      imageUrls.push(attachment.url);
    }
    // Add proxy URL if available (higher quality)
    if (attachment.proxyURL && attachment.proxyURL !== attachment.url) {
      imageUrls.push(attachment.proxyURL);
    }
  });
  
  // 2. Get ALL embeds (forwarded images, link previews, rich embeds)
  message.embeds.forEach((embed) => {
    // URL field (some embeds have the direct URL here)
    if (embed.url) {
      const urlImages = extractUrlsFromText(embed.url);
      imageUrls.push(...urlImages);
    }
    
    // Main image
    if (embed.image?.url) {
      imageUrls.push(embed.image.url);
      if (embed.image.proxyURL && embed.image.proxyURL !== embed.image.url) {
        imageUrls.push(embed.image.proxyURL);
      }
    }
    
    // Thumbnail
    if (embed.thumbnail?.url) {
      imageUrls.push(embed.thumbnail.url);
      if (embed.thumbnail.proxyURL && embed.thumbnail.proxyURL !== embed.thumbnail.url) {
        imageUrls.push(embed.thumbnail.proxyURL);
      }
    }
    
    // Video thumbnail
    if (embed.video?.proxyURL) {
      imageUrls.push(embed.video.proxyURL);
    }
    if (embed.video?.url) {
      imageUrls.push(embed.video.url);
    }
    
    // Author icon
    if (embed.author?.iconURL) {
      imageUrls.push(embed.author.iconURL);
      if (embed.author.proxyIconURL && embed.author.proxyIconURL !== embed.author.iconURL) {
        imageUrls.push(embed.author.proxyIconURL);
      }
    }
    
    // Footer icon
    if (embed.footer?.iconURL) {
      imageUrls.push(embed.footer.iconURL);
      if (embed.footer.proxyIconURL && embed.footer.proxyIconURL !== embed.footer.iconURL) {
        imageUrls.push(embed.footer.proxyIconURL);
      }
    }
    
    // Title with URLs
    if (embed.title) {
      const titleUrls = extractUrlsFromText(embed.title);
      imageUrls.push(...titleUrls);
    }
    
    // Fields with image URLs
    if (embed.fields && embed.fields.length > 0) {
      embed.fields.forEach(field => {
        const nameUrls = extractUrlsFromText(field.name);
        const valueUrls = extractUrlsFromText(field.value);
        imageUrls.push(...nameUrls, ...valueUrls);
      });
    }
    
    // Description with URLs
    if (embed.description) {
      const descUrls = extractUrlsFromText(embed.description);
      imageUrls.push(...descUrls);
    }
  });
  
  // 3. Get stickers
  if (message.stickers && message.stickers.size > 0) {
    message.stickers.forEach((sticker) => {
      if (sticker.url) {
        imageUrls.push(sticker.url);
      }
    });
  }
  
  // 4. Extract Discord CDN URLs from message content (all possible formats)
  const contentUrls = extractUrlsFromText(message.content);
  imageUrls.push(...contentUrls);
  
  // Deduplicate by attachment ID (keep only cdn.discordapp.com, skip media.discordapp.net)
  const urlMap = new Map<string, string>();
  
  imageUrls.forEach(url => {
    try {
      const urlObj = new URL(url);
      
      // Only keep Discord CDN URLs or image extensions
      if (!urlObj.hostname.includes('discord') && !url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|jfif|tiff)(\?|$)/i)) {
        return;
      }
      
      // Extract attachment ID from URL: /attachments/channelId/attachmentId/filename
      const pathMatch = urlObj.pathname.match(/\/attachments\/(\d+)\/(\d+)\//);
      if (!pathMatch) return;
      
      const attachmentId = pathMatch[2]; // This is the unique identifier
      
      // Check if we already have this attachment
      const existing = urlMap.get(attachmentId);
      
      if (!existing) {
        // New attachment, prefer CDN over media
        if (urlObj.hostname === 'cdn.discordapp.com') {
          urlMap.set(attachmentId, url);
        } else {
          urlMap.set(attachmentId, url);
        }
      } else {
        // Replace media.discordapp.net with cdn.discordapp.com if we find it
        if (urlObj.hostname === 'cdn.discordapp.com' && existing.includes('media.discordapp.net')) {
          urlMap.set(attachmentId, url);
        }
      }
    } catch {
      // Invalid URL, skip
    }
  });
  
  return Array.from(urlMap.values());
}

// Helper to extract CDN URLs from text
function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  
  const urls: string[] = [];
  
  // Discord CDN patterns (all variations) - More comprehensive
  const patterns = [
    // Standard CDN with known image extensions
    /https?:\/\/cdn\.discordapp\.com\/attachments\/\d+\/\d+\/[^\s<>\"\']+\.(jpg|jpeg|png|gif|webp|bmp|svg|jfif|tiff)(\?[^\s<>\"\']*)?/gi,
    // Media CDN with known image extensions
    /https?:\/\/media\.discordapp\.net\/attachments\/\d+\/\d+\/[^\s<>\"\']+\.(jpg|jpeg|png|gif|webp|bmp|svg|jfif|tiff)(\?[^\s<>\"\']*)?/gi,
    // Image URLs without extension but with query params (Discord sometimes does this)
    /https?:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/\d+\/\d+\/[^\s<>\"\']+\?[^\s<>\"\']*(?:width|height|size|format)[^\s<>\"\']*?/gi,
    // Any Discord CDN/media URL (catch-all)
    /https?:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/\d+\/\d+\/[^\s<>\"\']+/gi,
    // Emoji/sticker CDN
    /https?:\/\/cdn\.discordapp\.com\/emojis\/\d+\.(png|gif|webp)/gi,
    /https?:\/\/media\.discordapp\.net\/stickers\/\d+\.(png|gif|webp)/gi,
  ];
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      urls.push(...matches);
    }
  });
  
  return urls;
}

// Helper function to verify if an image URL is valid and accessible
async function verifyImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'DiscordBot (VouchBot, 1.0.0)',
      },
    });
    
    // Check if response is successful and content-type is an image
    if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
      return true;
    }
    
    // If HEAD fails, try GET with range to check first bytes
    if (!response.ok) {
      const getResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'DiscordBot (VouchBot, 1.0.0)',
          'Range': 'bytes=0-1024', // Only fetch first 1KB
        },
      });
      
      if (getResponse.ok && getResponse.headers.get('content-type')?.startsWith('image/')) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.log(`❌ Failed to verify image URL: ${url} - ${error}`);
    return false;
  }
}

export const collectProofCommand = {
  data: new SlashCommandBuilder()
    .setName('collect-proof')
    .setDescription('Collect all proof images from a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to collect proof from')
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
      await interaction.editReply(`🔄 Starting to collect proof from ${channel}...`);

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
            `🔄 Collecting proof... ${allMessages.length} messages scanned so far.`
          );
        }
      }

      // Sort messages by timestamp (oldest first)
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Process and extract image URLs from all messages
      const capturedProof: CapturedProof[] = [];
      let totalImages = 0;
      let messagesWithImages = 0;
      let invalidImages = 0;

      await interaction.editReply(
        `🔄 Processing ${allMessages.length} messages to extract and verify images...`
      );

      // First pass: collect all images (one record per image)
      let processedCount = 0;
      
      // Create log file
      const logFileName = `proof-collection-${Date.now()}.txt`;
      const logFilePath = path.join(process.cwd(), logFileName);
      let logContent = '';
      
      const log = (message: string) => {
        console.log(message);
        logContent += message + '\n';
      };
      
      log('\n🔍 ========== STARTING IMAGE URL EXTRACTION ==========\n');
      log(`Channel: ${channel.name} (${channel.id})`);
      log(`Total messages to scan: ${allMessages.length}`);
      log(`Started at: ${new Date().toISOString()}\n`);
      
      for (const msg of allMessages) {
        processedCount++;
        const imageUrls = extractImageUrls(msg);
        
        log(`\n📝 Message ${processedCount} from ${msg.author.tag}:`);
        log(`   Message ID: ${msg.id}`);
        log(`   Content: ${msg.content.substring(0, 100) || '[No content]'}`);
        log(`   Attachments: ${msg.attachments.size}`);
        log(`   Embeds: ${msg.embeds.length}`);
        log(`   Extracted URLs (${imageUrls.length}):`);
        imageUrls.forEach((url, idx) => {
          log(`      ${idx + 1}. ${url}`);
        });
        
        // Remove duplicates
        const uniqueImageUrls = [...new Set(imageUrls)];
        
        if (uniqueImageUrls.length !== imageUrls.length) {
          log(`   ⚠️  Removed ${imageUrls.length - uniqueImageUrls.length} duplicate URLs`);
        }
        
        // Verify and collect valid images
        let validImagesInMessage = 0;
        if (uniqueImageUrls.length > 0) {
          log(`\n   🔍 Verifying ${uniqueImageUrls.length} unique URLs...`);
          
          for (const imageUrl of uniqueImageUrls) {
            // Log the URL being checked
            log(`\n   🌐 Checking: ${imageUrl}`);
            
            // Check if URL has query parameters
            const hasQueryParams = imageUrl.includes('?');
            log(`      Has query params: ${hasQueryParams ? '✅ YES' : '❌ NO'}`);
            
            if (!hasQueryParams) {
              log(`      ⚠️  WARNING: URL missing query parameters - may expire or be invalid`);
              log(`      💡 Valid format example: https://cdn.discordapp.com/.../image.jpg?ex=...&is=...&hm=...`);
            }
            
            // Verify the image URL before adding
            const isValid = await verifyImageUrl(imageUrl);
            
            if (isValid) {
              capturedProof.push({
                authorId: msg.author.id,
                authorName: msg.author.tag,
                authorAvatar: msg.author.displayAvatarURL(),
                message: msg.content || '[No text content]',
                messageId: msg.id,
                timestamp: msg.createdAt,
                imageUrl: imageUrl, // Single image per record
              });
              totalImages++;
              validImagesInMessage++;
              log(`      ✅ VALID - Image accessible and will be saved`);
            } else {
              invalidImages++;
              log(`      ❌ INVALID - Image not accessible or wrong content-type`);
            }
          }
          
          if (validImagesInMessage > 0) {
            messagesWithImages++;
          }
          
          log(`\n   📊 Message Summary: ${validImagesInMessage} valid, ${uniqueImageUrls.length - validImagesInMessage} invalid`);
          
          // Update progress every 10 messages
          if (processedCount % 10 === 0) {
            await interaction.editReply(
              `🔄 Processing ${processedCount}/${allMessages.length}...\n` +
              `✅ Valid: ${totalImages} images\n` +
              `❌ Invalid: ${invalidImages} images`
            );
          }
        } else {
          log(`   ℹ️  No image URLs found in this message`);
        }
      }
      
      log('\n🔍 ========== IMAGE URL EXTRACTION COMPLETE ==========\n');
      log(`\nFINAL STATISTICS:`);
      log(`Total messages scanned: ${allMessages.length}`);
      log(`Messages with valid images: ${messagesWithImages}`);
      log(`Valid images found: ${totalImages}`);
      log(`Invalid/unavailable images: ${invalidImages}`);
      log(`\nCompleted at: ${new Date().toISOString()}`);
      
      // Write log to file
      fs.writeFileSync(logFilePath, logContent);
      console.log(`📝 Log file created: ${logFileName}`);
      
      // Final verification complete message
      await interaction.editReply(
        `✅ Verification complete!\n` +
        `📊 Processed ${allMessages.length} messages\n` +
        `✅ Valid: ${totalImages} images\n` +
        `❌ Invalid: ${invalidImages} images\n\n` +
        `⏳ Creating summary...`
      );
      
      console.log(`\n📊 FINAL STATS:`);
      console.log(`   Total messages scanned: ${allMessages.length}`);
      console.log(`   Messages with valid images: ${messagesWithImages}`);
      console.log(`   Valid images found: ${totalImages}`);
      console.log(`   Invalid/unavailable images: ${invalidImages}`);

      // Create proof session in database
      const session = await prisma.proofSession.create({
        data: {
          channelId: channel.id,
          channelName: channel.name,
          totalProofs: capturedProof.length, // Total individual image records
          totalImages: totalImages, // Same as totalProofs now
          startedBy: interaction.user.id,
        },
      });

      console.log(`📦 Proof session created: ${session.id}`);
      console.log(`📊 Cache size before: ${capturedProofCache.size}`);

      // Store in cache for later push to database
      capturedProofCache.set(session.id, {
        channelId: channel.id,
        channelName: channel.name,
        data: capturedProof,
        sessionId: session.id,
        userId: interaction.user.id,
      });

      console.log(`📊 Cache size after: ${capturedProofCache.size}`);
      console.log(`✅ Cached proof data for session: ${session.id}`);

      // Calculate statistics for the summary
      const uniqueAuthors = new Set(capturedProof.map((d) => d.authorId)).size;
      
      // Get top contributors (count unique messages per author)
      const authorCounts: { [key: string]: { name: string; posts: number; images: number } } = {};
      const authorMessagesSeen: { [key: string]: Set<string> } = {};
      
      capturedProof.forEach((d) => {
        if (!authorCounts[d.authorId]) {
          authorCounts[d.authorId] = { name: d.authorName, posts: 0, images: 0 };
          authorMessagesSeen[d.authorId] = new Set();
        }
        // Count unique messages
        if (!authorMessagesSeen[d.authorId].has(d.messageId)) {
          authorCounts[d.authorId].posts++;
          authorMessagesSeen[d.authorId].add(d.messageId);
        }
        // Count each image
        authorCounts[d.authorId].images++;
      });
      
      const topContributors = Object.entries(authorCounts)
        .sort(([, a], [, b]) => b.images - a.images)
        .slice(0, 5)
        .map(([, data]) => `${data.name}: ${data.images} images (${data.posts} posts)`)
        .join('\n');

      // Create summary embed
      const summaryEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📸 Proof Collection Summary')
        .setDescription(`Successfully collected and verified proof from ${channel}`)
        .addFields(
          { name: '✅ Valid Images', value: totalImages.toString(), inline: true },
          { name: '❌ Invalid/Unavailable', value: invalidImages.toString(), inline: true },
          { name: '👥 Unique Contributors', value: uniqueAuthors.toString(), inline: true },
          { name: '🏆 Top Contributors', value: topContributors || 'None', inline: false },
          {
            name: '📅 Date Range',
            value: capturedProof.length > 0
              ? `${capturedProof[0].timestamp.toLocaleDateString()} - ${capturedProof[capturedProof.length - 1].timestamp.toLocaleDateString()}`
              : 'N/A',
            inline: false,
          }
        )
        .setFooter({ text: 'Only verified images will be saved to the database' })
        .setTimestamp();

      // Create action buttons
      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`push_proof_${session.id}`)
            .setLabel('Push to Database')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💾'),
          new ButtonBuilder()
            .setCustomId(`cancel_proof_${session.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
        );

      // Create log file attachment
      const logAttachment = new AttachmentBuilder(logFilePath, { name: logFileName });

      await interaction.editReply({
        content: '✅ Proof collection completed! See attached log file for detailed URL analysis.',
        embeds: [summaryEmbed],
        components: [actionRow],
        files: [logAttachment],
      });
      
      // Clean up log file after sending (optional, comment out if you want to keep it)
      setTimeout(() => {
        if (fs.existsSync(logFilePath)) {
          fs.unlinkSync(logFilePath);
          console.log(`🗑️ Cleaned up log file: ${logFileName}`);
        }
      }, 10000); // Delete after 10 seconds
    } catch (error) {
      console.error('Error collecting proof:', error);
      await interaction.editReply('❌ An error occurred while collecting proof. Please check the bot permissions and try again.');
    }
  },
};

// Handle button interactions for pushing to database or canceling
export async function handleProofButtonInteraction(interaction: ButtonInteraction) {
  const { customId } = interaction;
  
  console.log(`🔘 Proof button clicked: ${customId}`);
  
  // Extract action and session ID properly
  let action: string;
  let sessionId: string;
  
  if (customId.startsWith('push_proof_')) {
    action = 'push_proof';
    sessionId = customId.substring('push_proof_'.length);
  } else if (customId.startsWith('cancel_proof_')) {
    action = 'cancel_proof';
    sessionId = customId.substring('cancel_proof_'.length);
  } else {
    return; // Not a proof button
  }
  
  console.log(`📊 Action: ${action}, Session ID: ${sessionId}`);
  console.log(`📊 Cache size: ${capturedProofCache.size}`);
  console.log(`📊 Cache keys: ${Array.from(capturedProofCache.keys()).join(', ')}`);
  
  if (action === 'cancel_proof') {
    // Cancel operation
    const cachedData = capturedProofCache.get(sessionId);
    
    console.log(`🔍 Looking for cached data with session ID: ${sessionId}`);
    console.log(`🔍 Found cached data: ${cachedData ? 'YES' : 'NO'}`);
    
    if (cachedData && cachedData.userId === interaction.user.id) {
      capturedProofCache.delete(sessionId);
      
      // Update session as not pushed
      await prisma.proofSession.update({
        where: { id: sessionId },
        data: { 
          summary: 'Operation cancelled by user',
          completedAt: new Date(),
        },
      });
      
      const cancelEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Operation Cancelled')
        .setDescription('The proof collection operation has been cancelled. No data was saved to the database.')
        .setTimestamp();
      
      await interaction.update({
        content: '❌ Operation cancelled',
        embeds: [cancelEmbed],
        components: [],
      });
    } else {
      await interaction.reply({
        content: '❌ No active proof session found or session expired.',
        ephemeral: true,
      });
    }
    return;
  }
  
  if (action === 'push_proof') {
    // Push to database with real-time progress
    const cachedData = capturedProofCache.get(sessionId);
    
    console.log(`🔍 Looking for cached data with session ID: ${sessionId}`);
    console.log(`🔍 Found cached data: ${cachedData ? 'YES' : 'NO'}`);
    
    if (!cachedData || cachedData.userId !== interaction.user.id) {
      await interaction.reply({
        content: '❌ No proof session found or session expired. Please run `/collect-proof` again.',
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
        .setTitle('💾 Pushing Proof to Database')
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
        
        await prisma.proof.createMany({
          data: batch.map((item) => ({
            channelId: channelId,
            channelName: channelName,
            authorId: item.authorId,
            authorName: item.authorName,
            authorAvatar: item.authorAvatar,
            message: item.message,
            messageId: item.messageId,
            timestamp: item.timestamp,
            imageUrls: [item.imageUrl], // Convert single URL to array for schema
          })),
          skipDuplicates: true,
        });
        
        processed += batch.length;
        const percentage = Math.round((processed / totalRecords) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Update progress
        const updatedProgressEmbed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('💾 Pushing Proof to Database')
          .setDescription('Processing records in real-time...')
          .addFields(
            { name: '📊 Progress', value: `${processed} / ${totalRecords} (${percentage}%)`, inline: true },
            { name: '⏱️ Elapsed Time', value: `${elapsed}s`, inline: true },
            { name: '📦 Batch', value: `${Math.ceil(processed / batchSize)} / ${Math.ceil(totalRecords / batchSize)}`, inline: true }
          )
          .setTimestamp();
        
        // Update every batch
        await interaction.editReply({
          content: `🔄 Processing... ${percentage}% complete`,
          embeds: [updatedProgressEmbed],
        });
      }
      
      // Calculate total images (each record is one image now)
      const totalImages = data.length;
      
      // Update session as completed
      await prisma.proofSession.update({
        where: { id: sessionId },
        data: {
          completedAt: new Date(),
          isPushed: true,
          pushedAt: new Date(),
          summary: `Successfully pushed ${processed} proofs (${totalImages} images) to database`,
        },
      });
      
      // Clear cache
      capturedProofCache.delete(sessionId);
      
      const finalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // Final success embed
      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Proof Successfully Added to Database')
        .setDescription(`All collected proof has been saved to the database.`)
        .addFields(
          { name: '🖼️ Total Images Created', value: totalImages.toString(), inline: true },
          { name: '📝 Database Records', value: processed.toString(), inline: true },
          { name: '⏱️ Total Time', value: `${finalTime}s`, inline: true },
          { name: '📊 Channel', value: channelName, inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({
        content: '✅ Database operation completed!',
        embeds: [successEmbed],
      });
      
    } catch (error) {
      console.error('Error pushing proof to database:', error);
      
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Database Error')
        .setDescription('An error occurred while saving proof to the database.')
        .setTimestamp();
      
      await interaction.editReply({
        content: '❌ Operation failed',
        embeds: [errorEmbed],
      });
    }
  }
}

export { capturedProofCache };
