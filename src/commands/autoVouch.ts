import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../database';
import { addVouchChannel, removeVouchChannel } from '../utils/channelCache';

export const autoVouchCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-vouch-add')
    .setDescription('Enable automatic vouch collection for a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to enable auto-vouch for')
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
      const existing = await prisma.autoVouchChannel.findUnique({
        where: { channelId: channel.id },
      });

      if (existing) {
        if (existing.isEnabled) {
          await interaction.reply({
            content: `⚠️ Auto-vouch is already enabled for ${channel}.`,
            ephemeral: true,
          });
          return;
        } else {
          // Re-enable if it was disabled
          await prisma.autoVouchChannel.update({
            where: { channelId: channel.id },
            data: { isEnabled: true },
          });
          
          // Update cache
          addVouchChannel(channel.id);
          
          const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ Auto-Vouch Re-enabled')
            .setDescription(`Auto-vouch collection has been re-enabled for ${channel}`)
            .addFields(
              { name: '📋 Requirements', value: '• Must contain "legit", "vouch", "rep", etc.\n• Must mention the user being vouched for\n• Must have value (INR, Crypto, Nitro, etc.)', inline: false },
              { name: '🔄 Actions', value: '• Valid vouches: Saved to database ✅\n• Invalid messages: Deleted with warning ⚠️', inline: false }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
          return;
        }
      }

      // Create new auto-vouch channel
      await prisma.autoVouchChannel.create({
        data: {
          guildId: interaction.guildId!,
          channelId: channel.id,
          channelName: channel.name,
          isEnabled: true,
        },
      });
      
      // Update cache
      addVouchChannel(channel.id);

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Auto-Vouch Enabled')
        .setDescription(`Auto-vouch collection has been enabled for ${channel}`)
        .addFields(
          { name: '📋 Vouch Requirements', value: '• Must contain "legit", "vouch", "rep", etc.\n• Must mention the user being vouched for\n• Must have value (INR, Crypto, Nitro, etc.)', inline: false },
          { name: '🔄 Bot Actions', value: '• Valid vouches: Automatically saved to database ✅\n• Invalid messages: Deleted with warning message ⚠️\n• Success message: Shows for 3 seconds then deleted', inline: false },
          { name: '⚙️ Management', value: 'Use `/auto-vouch-disable` to stop monitoring this channel', inline: false }
        )
        .setFooter({ text: `Enabled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
      console.log(`✅ Auto-vouch enabled for channel ${channel.name} (${channel.id}) in guild ${interaction.guildId}`);
    } catch (error) {
      console.error('Error enabling auto-vouch:', error);
      await interaction.reply({
        content: '❌ An error occurred while enabling auto-vouch. Please try again.',
        ephemeral: true,
      });
    }
  },
};

export const autoVouchDisableCommand = {
  data: new SlashCommandBuilder()
    .setName('auto-vouch-disable')
    .setDescription('Disable automatic vouch collection for a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to disable auto-vouch for')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
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
      const existing = await prisma.autoVouchChannel.findUnique({
        where: { channelId: channel.id },
      });

      if (!existing || !existing.isEnabled) {
        await interaction.reply({
          content: `⚠️ Auto-vouch is not enabled for ${channel}.`,
          ephemeral: true,
        });
        return;
      }

      // Disable auto-vouch
      await prisma.autoVouchChannel.update({
        where: { channelId: channel.id },
        data: { isEnabled: false },
      });
      
      // Update cache
      removeVouchChannel(channel.id);

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🔴 Auto-Vouch Disabled')
        .setDescription(`Auto-vouch collection has been disabled for ${channel}`)
        .addFields(
          { name: '📊 Status', value: 'The bot will no longer monitor this channel for vouches.', inline: false },
          { name: '🔄 Re-enable', value: 'Use `/auto-vouch-add` to enable it again', inline: false }
        )
        .setFooter({ text: `Disabled by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
      console.log(`🔴 Auto-vouch disabled for channel ${channel.name} (${channel.id})`);
    } catch (error) {
      console.error('Error disabling auto-vouch:', error);
      await interaction.reply({
        content: '❌ An error occurred while disabling auto-vouch. Please try again.',
        ephemeral: true,
      });
    }
  },
};
