import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../database';

export const deleteVouchCommand = {
  data: new SlashCommandBuilder()
    .setName('delete-vouch')
    .setDescription('Delete a vouch by message ID (Admin only)')
    .addStringOption(option =>
      option
        .setName('message_id')
        .setDescription('The Discord message ID of the vouch to delete')
        .setRequired(true)
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

    const messageId = interaction.options.getString('message_id', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      // Find the vouch in database
      const vouch = await prisma.vouch.findUnique({
        where: { messageId: messageId },
      });

      if (!vouch) {
        await interaction.editReply({
          content: `❌ No vouch found with message ID: \`${messageId}\``,
        });
        return;
      }

      // Try to delete the Discord message
      let messageDeleted = false;
      try {
        const channel = await interaction.client.channels.fetch(vouch.channelId);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(messageId);
          await message.delete();
          messageDeleted = true;
        }
      } catch (error) {
        console.log(`⚠️ Could not delete Discord message ${messageId}:`, error);
        // Continue anyway - we'll still delete from database
      }

      // Delete from database
      await prisma.vouch.delete({
        where: { messageId: messageId },
      });

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🗑️ Vouch Deleted')
        .setDescription(`Successfully deleted vouch from ${vouch.authorName}`)
        .addFields(
          { name: '📝 Message ID', value: messageId, inline: true },
          { name: '👤 Author', value: vouch.authorName, inline: true },
          { name: '📅 Original Date', value: vouch.timestamp.toLocaleDateString(), inline: true },
          { name: '💬 Message Preview', value: vouch.message.substring(0, 100) + (vouch.message.length > 100 ? '...' : ''), inline: false },
          { name: '🔄 Status', value: `Database: ✅ Deleted\nDiscord: ${messageDeleted ? '✅ Deleted' : '⚠️ Not found/already deleted'}`, inline: false }
        )
        .setFooter({ text: `Deleted by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🗑️ Vouch deleted: ${messageId} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error deleting vouch:', error);
      await interaction.editReply({
        content: '❌ An error occurred while deleting the vouch. Please try again.',
      });
    }
  },
};
