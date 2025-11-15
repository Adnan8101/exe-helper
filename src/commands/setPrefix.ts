import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { setBotPrefix } from '../utils/channelCache';

export const setPrefixCommand = {
  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Set the bot command prefix (Admin only)')
    .addStringOption(option =>
      option
        .setName('prefix')
        .setDescription('The new prefix (e.g., !, ., /)')
        .setRequired(true)
        .setMaxLength(5)
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

    const newPrefix = interaction.options.getString('prefix', true);

    // Validate prefix
    if (newPrefix.length === 0 || newPrefix.length > 5) {
      await interaction.reply({
        content: '❌ Prefix must be between 1 and 5 characters.',
        ephemeral: true,
      });
      return;
    }

    // Set the new prefix
    setBotPrefix(newPrefix);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Prefix Updated')
      .setDescription(`Bot prefix has been changed to: \`${newPrefix}\``)
      .addFields(
        { name: '📝 Usage', value: `Reply to a vouch/proof message with \`${newPrefix}delete\` to delete it`, inline: false },
        { name: 'ℹ️ Note', value: 'This prefix is used for message-based commands like delete', inline: false }
      )
      .setFooter({ text: `Changed by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    
    console.log(`✅ Prefix changed to: ${newPrefix} by ${interaction.user.tag}`);
  },
};
