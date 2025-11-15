import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { prisma } from '../database';

export const flushProofCommand = {
  data: new SlashCommandBuilder()
    .setName('flush-proof')
    .setDescription('Delete all proof images from the database (Admin only)')
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

    try {
      // Get counts before deletion
      const proofCount = await prisma.proof.count();
      const sessionCount = await prisma.proofSession.count();

      if (proofCount === 0 && sessionCount === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('ℹ️ Database Already Empty')
          .setDescription('There are no proof records or sessions to delete.')
          .setTimestamp();

        await interaction.reply({
          embeds: [emptyEmbed],
          ephemeral: true,
        });
        return;
      }

      // Create warning embed
      const warningEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('⚠️ WARNING: Delete All Proof Data')
        .setDescription(
          '**This action will permanently delete ALL proof data from the database.**\n\n' +
          'This cannot be undone!'
        )
        .addFields(
          { name: '📸 Proof Records', value: proofCount.toString(), inline: true },
          { name: '📊 Proof Sessions', value: sessionCount.toString(), inline: true }
        )
        .setFooter({ text: 'Are you sure you want to continue?' })
        .setTimestamp();

      // Create confirmation buttons
      const confirmRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_flush_${interaction.user.id}`)
            .setLabel('Yes, Delete Everything')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
          new ButtonBuilder()
            .setCustomId(`cancel_flush_${interaction.user.id}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );

      await interaction.reply({
        embeds: [warningEmbed],
        components: [confirmRow],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error in flush-proof command:', error);
      await interaction.reply({
        content: '❌ An error occurred while checking the database.',
        ephemeral: true,
      });
    }
  },
};

// Handle button interactions for flush confirmation
export async function handleFlushButtonInteraction(interaction: ButtonInteraction) {
  const { customId } = interaction;

  if (!customId.startsWith('confirm_flush_') && !customId.startsWith('cancel_flush_')) {
    return;
  }

  // Extract user ID from custom ID
  const userId = customId.split('_')[2];

  // Verify the user clicking the button is the same one who initiated the command
  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: '❌ You cannot interact with this button.',
      ephemeral: true,
    });
    return;
  }

  if (customId.startsWith('cancel_flush_')) {
    const cancelEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Operation Cancelled')
      .setDescription('The flush operation has been cancelled. No data was deleted.')
      .setTimestamp();

    await interaction.update({
      embeds: [cancelEmbed],
      components: [],
    });
    return;
  }

  if (customId.startsWith('confirm_flush_')) {
    await interaction.deferUpdate();

    try {
      // Get counts before deletion
      const proofCount = await prisma.proof.count();
      const sessionCount = await prisma.proofSession.count();

      // Delete all proof records
      const deletedProofs = await prisma.proof.deleteMany({});
      
      // Delete all proof sessions
      const deletedSessions = await prisma.proofSession.deleteMany({});

      console.log(`🗑️ Deleted ${deletedProofs.count} proof records`);
      console.log(`🗑️ Deleted ${deletedSessions.count} proof sessions`);

      // Success embed
      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ All Proof Data Deleted')
        .setDescription('Successfully flushed all proof data from the database.')
        .addFields(
          { name: '📸 Proof Records Deleted', value: deletedProofs.count.toString(), inline: true },
          { name: '📊 Proof Sessions Deleted', value: deletedSessions.count.toString(), inline: true }
        )
        .setFooter({ text: `Flushed by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({
        embeds: [successEmbed],
        components: [],
      });
    } catch (error) {
      console.error('Error flushing proof data:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error')
        .setDescription('An error occurred while deleting proof data from the database.')
        .setTimestamp();

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [],
      });
    }
  }
}
