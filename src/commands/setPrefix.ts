import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Message,
} from 'discord.js';
import { prisma } from '../database';

export const setPrefixCommand = {
  data: new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Change the bot prefix for this server (Admin only)')
    .addStringOption(option =>
      option
        .setName('new_prefix')
        .setDescription('The new prefix to use')
        .setRequired(true)
        .setMaxLength(5)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'You need administrator permissions to use this command.',
        ephemeral: true,
      });
      return;
    }

    const newPrefix = interaction.options.getString('new_prefix', true);
    const guildId = interaction.guildId!;

    // Validate prefix
    if (newPrefix.length > 5) {
      await interaction.reply({
        content: 'Prefix must be 5 characters or less.',
        ephemeral: true,
      });
      return;
    }

    if (newPrefix.includes(' ')) {
      await interaction.reply({
        content: 'Prefix cannot contain spaces.',
        ephemeral: true,
      });
      return;
    }

    try {
      // Check if guild prefix exists
      const existing = await prisma.guildPrefix.findUnique({
        where: { guildId },
      });

      if (existing) {
        // Update existing prefix
        await prisma.guildPrefix.update({
          where: { guildId },
          data: {
            prefix: newPrefix,
            updatedBy: interaction.user.id,
          },
        });
      } else {
        // Create new prefix
        await prisma.guildPrefix.create({
          data: {
            guildId,
            prefix: newPrefix,
            updatedBy: interaction.user.id,
          },
        });
      }

      await interaction.reply({
        content: `Bot prefix has been changed to \`${newPrefix}\``,
        ephemeral: true,
      });

      console.log(`Prefix changed to "${newPrefix}" in guild ${guildId} by ${interaction.user.username}`);
    } catch (error) {
      console.error('Error changing prefix:', error);
      await interaction.reply({
        content: 'An error occurred while changing the prefix.',
        ephemeral: true,
      });
    }
  },
};

// Prefix command handler
export async function handlePrefixCommand(message: Message, prefix: string) {
  const content = message.content.slice(prefix.length).trim();
  const args = content.split(/\s+/);
  const commandName = args[0].toLowerCase();

  if (commandName !== 'prefix') return;

  // Check if user is admin
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    const reply = await message.reply('You need administrator permissions to use this command.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  const newPrefix = args[1];

  if (!newPrefix) {
    const reply = await message.reply(`Current prefix is \`${prefix}\`. Usage: \`${prefix}prefix <new_prefix>\``);
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  // Validate prefix
  if (newPrefix.length > 5) {
    const reply = await message.reply('Prefix must be 5 characters or less.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  if (newPrefix.includes(' ')) {
    const reply = await message.reply('Prefix cannot contain spaces.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  try {
    const guildId = message.guildId!;

    // Check if guild prefix exists
    const existing = await prisma.guildPrefix.findUnique({
      where: { guildId },
    });

    if (existing) {
      // Update existing prefix
      await prisma.guildPrefix.update({
        where: { guildId },
        data: {
          prefix: newPrefix,
          updatedBy: message.author.id,
        },
      });
    } else {
      // Create new prefix
      await prisma.guildPrefix.create({
        data: {
          guildId,
          prefix: newPrefix,
          updatedBy: message.author.id,
        },
      });
    }

    const reply = await message.reply(`Bot prefix has been changed to \`${newPrefix}\``);
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    setTimeout(() => message.delete().catch(() => {}), 5000);

    console.log(`Prefix changed to "${newPrefix}" in guild ${guildId} by ${message.author.username}`);
  } catch (error) {
    console.error('Error changing prefix:', error);
    const reply = await message.reply('An error occurred while changing the prefix.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  }
}

// Get the prefix for a guild
export async function getGuildPrefix(guildId: string): Promise<string> {
  try {
    const guildPrefix = await prisma.guildPrefix.findUnique({
      where: { guildId },
    });

    return guildPrefix?.prefix || '?';
  } catch (error) {
    console.error('Error fetching guild prefix:', error);
    return '?';
  }
}
