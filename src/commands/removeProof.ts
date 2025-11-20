import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { prisma } from '../database';

export const removeProofCommand = {
  data: new SlashCommandBuilder()
    .setName('remove-proof')
    .setDescription('Remove a proof by message ID')
    .addStringOption(option =>
      option
        .setName('messageid')
        .setDescription('The Discord message ID of the proof to remove')
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

    const messageId = interaction.options.getString('messageid', true);

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

      // Delete from database
      await prisma.proof.delete({
        where: { messageId: messageId },
      });

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🗑️ Proof Removed')
        .setDescription(`Successfully removed proof from database`)
        .addFields(
          { name: ' Message ID', value: messageId, inline: true },
          { name: ' Author', value: proof.authorName, inline: true },
          { name: ' Date', value: proof.timestamp.toLocaleDateString(), inline: true },
          { name: ' Images', value: `${proof.imageUrls.length} image(s)`, inline: true },
          { name: ' Message', value: proof.message.substring(0, 100) + (proof.message.length > 100 ? '...' : ''), inline: false }
        )
        .setFooter({ text: `Removed by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🗑️ Proof removed from database: ${messageId} by ${interaction.user.tag}`);
    } catch (error) {
      console.error('Error removing proof:', error);
      await interaction.editReply({
        content: '❌ An error occurred while removing the proof. Please try again.',
      });
    }
  },
};
