import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../database';

export const deleteProofCommand = {
  data: new SlashCommandBuilder()
    .setName('delete-proof')
    .setDescription('Delete a proof by message ID (Admin only)')
    .addStringOption(option =>
      option
        .setName('message_id')
        .setDescription('The Discord message ID of the proof to delete')
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
      // Look up message ID in Vouch table
      const vouch = await prisma.vouch.findUnique({
        where: { messageId: messageId },
      });

      if (!vouch) {
        await interaction.editReply({
          content: `❌ No vouch found with message ID: \`${messageId}\``,
        });
        return;
      }

      if (!vouch.proofUrl) {
        await interaction.editReply({
          content: `❌ Vouch with message ID \`${messageId}\` has no proof URL to delete.`,
        });
        return;
      }

      // Update the vouch to remove the proof URL
      await prisma.vouch.update({
        where: { messageId: messageId },
        data: { proofUrl: null },
      });

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🗑️ Proof URL Deleted')
        .setDescription(`Successfully removed proof URL from vouch`)
        .addFields(
          { name: '📝 Message ID', value: messageId, inline: true },
          { name: '👤 Author', value: vouch.authorName, inline: true },
          { name: '📅 Original Date', value: vouch.timestamp.toLocaleDateString(), inline: true },
          { name: '#️⃣ Vouch Number', value: `#${vouch.vouchNumber}`, inline: true },
          { name: '💬 Message Preview', value: vouch.message.substring(0, 100) + (vouch.message.length > 100 ? '...' : ''), inline: false },
          { name: '🔗 Removed Proof URL', value: vouch.proofUrl, inline: false }
        )
        .setFooter({ text: `Deleted by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🗑️ Proof URL deleted from vouch: ${messageId} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error deleting proof URL:', error);
      await interaction.editReply({
        content: '❌ An error occurred while deleting the proof URL. Please try again.',
      });
    }
  },
};
