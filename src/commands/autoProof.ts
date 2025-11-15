import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../database';
import { addProofChannel, removeProofChannel } from '../utils/channelCache';

export const autoProofCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-proof-add')
    .setDescription('Enable automatic proof collection for a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to enable auto-proof for')
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

    const targetChannel = interaction.options.getChannel('channel', true);

    if (targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Please select a text channel.',
        ephemeral: true,
      });
      return;
    }

    const channel = targetChannel as TextChannel;

    try {
      // Check if already enabled
      const existing = await prisma.autoProofChannel.findUnique({
        where: { channelId: channel.id },
      });

      if (existing) {
        if (existing.isEnabled) {
          await interaction.reply({
            content: `⚠️ Auto-proof is already enabled for ${channel}.`,
            ephemeral: true,
          });
          return;
        } else {
          // Re-enable if it was disabled
          await prisma.autoProofChannel.update({
            where: { channelId: channel.id },
            data: { isEnabled: true },
          });
          
          // Update cache
          addProofChannel(channel.id);
          
          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Auto-Proof Re-enabled')
            .setDescription(`Auto-proof collection has been re-enabled for ${channel}`)
            .addFields(
              { name: '📋 Requirements', value: '• Messages must contain valid image URLs\n• Images from Discord CDN will be collected', inline: false },
              { name: '🔄 Actions', value: '• Valid images: Saved to database ✅\n• No images: Ignored', inline: false }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
          return;
        }
      }

      // Create new auto-proof channel
      await prisma.autoProofChannel.create({
        data: {
          guildId: interaction.guildId!,
          channelId: channel.id,
          channelName: channel.name,
          isEnabled: true,
        },
      });
      
      // Update cache
      addProofChannel(channel.id);

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Auto-Proof Enabled')
        .setDescription(`Auto-proof collection has been enabled for ${channel}`)
        .addFields(
          { name: '📋 Proof Requirements', value: '• Messages must contain valid image URLs\n• Supports Discord CDN URLs, attachments, and embeds', inline: false },
          { name: '🔄 Bot Actions', value: '• Valid images: Automatically saved to database ✅\n• Messages without images: Ignored\n• All image URLs are verified before saving', inline: false },
          { name: '⚙️ Management', value: 'Use `/auto-proof-disable` to stop monitoring this channel', inline: false }
        )
        .setFooter({ text: `Enabled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
      console.log(`✅ Auto-proof enabled for channel ${channel.name} (${channel.id}) in guild ${interaction.guildId}`);
    } catch (error) {
      console.error('Error enabling auto-proof:', error);
      await interaction.reply({
        content: '❌ An error occurred while enabling auto-proof. Please try again.',
        ephemeral: true,
      });
    }
  },
};

export const autoProofDisableCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-proof-disable')
    .setDescription('Disable automatic proof collection for a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to disable auto-proof for')
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

    const targetChannel = interaction.options.getChannel('channel', true);

    if (targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Please select a text channel.',
        ephemeral: true,
      });
      return;
    }

    const channel = targetChannel as TextChannel;

    try {
      const existing = await prisma.autoProofChannel.findUnique({
        where: { channelId: channel.id },
      });

      if (!existing || !existing.isEnabled) {
        await interaction.reply({
          content: `⚠️ Auto-proof is not enabled for ${channel}.`,
          ephemeral: true,
        });
        return;
      }

      // Disable auto-proof
      await prisma.autoProofChannel.update({
        where: { channelId: channel.id },
        data: { isEnabled: false },
      });
      
      // Update cache
      removeProofChannel(channel.id);

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🔴 Auto-Proof Disabled')
        .setDescription(`Auto-proof collection has been disabled for ${channel}`)
        .addFields(
          { name: '📊 Status', value: 'The bot will no longer monitor this channel for proof images.', inline: false },
          { name: '🔄 Re-enable', value: 'Use `/auto-proof-add` to enable it again', inline: false }
        )
        .setFooter({ text: `Disabled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
      console.log(`🔴 Auto-proof disabled for channel ${channel.name} (${channel.id})`);
    } catch (error) {
      console.error('Error disabling auto-proof:', error);
      await interaction.reply({
        content: '❌ An error occurred while disabling auto-proof. Please try again.',
        ephemeral: true,
      });
    }
  },
};
