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
      // Find the proof in database
      const proof = await prisma.proof.findUnique({
        where: { messageId: messageId },
      });

      if (!proof) {
        await interaction.editReply({
          content: `❌ No proof found with message ID: \`${messageId}\``,
        });
        return;
      }

      // Try to delete the Discord message
      let messageDeleted = false;
      try {
        const channel = await interaction.client.channels.fetch(proof.channelId);
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
      await prisma.proof.delete({
        where: { messageId: messageId },
      });

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🗑️ Proof Deleted')
        .setDescription(`Successfully deleted proof from ${proof.authorName}`)
        .addFields(
          { name: '📝 Message ID', value: messageId, inline: true },
          { name: '👤 Author', value: proof.authorName, inline: true },
          { name: '📅 Original Date', value: proof.timestamp.toLocaleDateString(), inline: true },
          { name: '🖼️ Images', value: `${proof.imageUrls.length} image(s)`, inline: true },
          { name: '💬 Message Preview', value: proof.message.substring(0, 100) + (proof.message.length > 100 ? '...' : ''), inline: false },
          { name: '🔄 Status', value: `Database: ✅ Deleted\nDiscord: ${messageDeleted ? '✅ Deleted' : '⚠️ Not found/already deleted'}`, inline: false }
        )
        .setFooter({ text: `Deleted by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🗑️ Proof deleted: ${messageId} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error deleting proof:', error);
      await interaction.editReply({
        content: '❌ An error occurred while deleting the proof. Please try again.',
      });
    }
  },
};
