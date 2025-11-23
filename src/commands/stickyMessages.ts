import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import { prisma } from '../database';

// Slash Command: /stick
export const stickCommand = {
  data: new SlashCommandBuilder()
    .setName('stick')
    .setDescription('Stick a message to a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to stick the message in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
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

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const channelId = channel.id;

    try {
      // Check if sticky already exists in this channel
      const existing = await prisma.stickyMessage.findUnique({
        where: { channelId },
      });

      if (existing) {
        await interaction.reply({
          content: `A sticky message already exists in <#${channelId}>. Use /stickremove first to create a new one.`,
          ephemeral: true,
        });
        return;
      }

      // Create placeholder in database
      await prisma.stickyMessage.create({
        data: {
          guildId: interaction.guildId!,
          channelId: channelId,
          channelName: channel.name,
          message: '',
          isActive: false,
          createdBy: interaction.user.id,
          createdByName: interaction.user.username,
        },
      });

      // Show modal for message input
      const modal = new ModalBuilder()
        .setCustomId(`sticky_setup_modal_${channelId}`)
        .setTitle('Set Sticky Message');

      const messageInput = new TextInputBuilder()
        .setCustomId('sticky_message_input')
        .setLabel('Enter your sticky message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type your message here...\n\nLine breaks and spacing will be preserved.')
        .setRequired(true)
        .setMaxLength(2000);

      const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (error) {
      console.error('Error creating sticky:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while setting up the sticky message.',
          ephemeral: true,
        });
      }
    }
  },
};

// Slash Command: /stickstop
export const stickStopCommand = {
  data: new SlashCommandBuilder()
    .setName('stickstop')
    .setDescription('Stop the sticky message in a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to stop sticky in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
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

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const channelId = channel.id;

    try {
      const sticky = await prisma.stickyMessage.findUnique({
        where: { channelId },
      });

      if (!sticky) {
        await interaction.reply({
          content: 'There is no sticky message in that channel.',
          ephemeral: true,
        });
        return;
      }

      if (!sticky.isActive) {
        await interaction.reply({
          content: 'The sticky message is already stopped.',
          ephemeral: true,
        });
        return;
      }

      // Update to stopped
      await prisma.stickyMessage.update({
        where: { channelId },
        data: { isActive: false },
      });

      await interaction.reply({
        content: 'Sticky message has been stopped.',
        ephemeral: true,
      });

      console.log(`Sticky message stopped in channel ${channelId}`);
    } catch (error) {
      console.error('Error stopping sticky message:', error);
      await interaction.reply({
        content: 'An error occurred while stopping the sticky message.',
        ephemeral: true,
      });
    }
  },
};

// Slash Command: /stickstart
export const stickStartCommand = {
  data: new SlashCommandBuilder()
    .setName('stickstart')
    .setDescription('Restart a stopped sticky message (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to restart sticky in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
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

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const channelId = channel.id;

    try {
      const sticky = await prisma.stickyMessage.findUnique({
        where: { channelId },
      });

      if (!sticky) {
        await interaction.reply({
          content: 'There is no sticky message in that channel.',
          ephemeral: true,
        });
        return;
      }

      if (sticky.isActive) {
        await interaction.reply({
          content: 'The sticky message is already active.',
          ephemeral: true,
        });
        return;
      }

      // Repost the sticky message
      const stickyMsg = await channel.send(sticky.message);

      // Update to active
      await prisma.stickyMessage.update({
        where: { channelId },
        data: {
          isActive: true,
          lastMessageId: stickyMsg.id,
        },
      });

      await interaction.reply({
        content: 'Sticky message has been restarted.',
        ephemeral: true,
      });

      console.log(`Sticky message restarted in channel ${channelId}`);
    } catch (error) {
      console.error('Error restarting sticky message:', error);
      await interaction.reply({
        content: 'An error occurred while restarting the sticky message.',
        ephemeral: true,
      });
    }
  },
};

// Slash Command: /stickremove
export const stickRemoveCommand = {
  data: new SlashCommandBuilder()
    .setName('stickremove')
    .setDescription('Remove the sticky message from a channel (Admin only)')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to remove sticky from')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
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

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const channelId = channel.id;

    try {
      const sticky = await prisma.stickyMessage.findUnique({
        where: { channelId },
      });

      if (!sticky) {
        await interaction.reply({
          content: 'There is no sticky message in that channel.',
          ephemeral: true,
        });
        return;
      }

      // Try to delete the last posted sticky message
      if (sticky.lastMessageId) {
        try {
          const msg = await channel.messages.fetch(sticky.lastMessageId);
          await msg.delete();
        } catch (error) {
          console.log('Could not delete last sticky message (might be already deleted)');
        }
      }

      // Delete from database
      await prisma.stickyMessage.delete({
        where: { channelId },
      });

      await interaction.reply({
        content: 'Sticky message has been removed.',
        ephemeral: true,
      });

      console.log(`Sticky message removed from channel ${channelId}`);
    } catch (error) {
      console.error('Error removing sticky message:', error);
      await interaction.reply({
        content: 'An error occurred while removing the sticky message.',
        ephemeral: true,
      });
    }
  },
};

// Slash Command: /getstickies
export const getStickiesCommand = {
  data: new SlashCommandBuilder()
    .setName('getstickies')
    .setDescription('Show all sticky messages in this server (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'You need administrator permissions to use this command.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId!;

    try {
      const stickies = await prisma.stickyMessage.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });

      if (stickies.length === 0) {
        await interaction.reply({
          content: 'There are no sticky messages in this server.',
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Sticky Messages in ${interaction.guild?.name}`)
        .setColor(0x00ff00)
        .setTimestamp();

      const activeStickies = stickies.filter(s => s.isActive);
      const stoppedStickies = stickies.filter(s => !s.isActive);

      if (activeStickies.length > 0) {
        const activeList = activeStickies.map(s => {
          const preview = s.message.length > 50 ? s.message.substring(0, 50) + '...' : s.message;
          return `<#${s.channelId}>\n"${preview}"`;
        }).join('\n\n');
        
        embed.addFields({
          name: `Active Stickies (${activeStickies.length})`,
          value: activeList,
          inline: false,
        });
      }

      if (stoppedStickies.length > 0) {
        const stoppedList = stoppedStickies.map(s => {
          const preview = s.message.length > 50 ? s.message.substring(0, 50) + '...' : s.message;
          return `<#${s.channelId}>\n"${preview}"`;
        }).join('\n\n');
        
        embed.addFields({
          name: `Stopped Stickies (${stoppedStickies.length})`,
          value: stoppedList,
          inline: false,
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error getting sticky messages:', error);
      await interaction.reply({
        content: 'An error occurred while fetching sticky messages.',
        ephemeral: true,
      });
    }
  },
};

// Handler for sticky message modal submission
export async function handleStickyMessageModal(interaction: ModalSubmitInteraction) {
  const channelId = interaction.customId.replace('sticky_setup_modal_', '').replace('sticky_edit_modal_', '');
  const message = interaction.fields.getTextInputValue('sticky_message_input');

  try {
    // Get the sticky message record
    const sticky = await prisma.stickyMessage.findUnique({
      where: { channelId },
    });

    if (!sticky) {
      await interaction.reply({
        content: '❌ Sticky message configuration not found. Please run /stick again.',
        ephemeral: true,
      });
      return;
    }

    // Get the channel
    const channel = await interaction.client.channels.fetch(channelId) as TextChannel;
    
    if (!channel) {
      await interaction.reply({
        content: '❌ Channel not found.',
        ephemeral: true,
      });
      return;
    }

    // Delete old message if exists
    if (sticky.lastMessageId) {
      try {
        const oldMsg = await channel.messages.fetch(sticky.lastMessageId);
        await oldMsg.delete();
        console.log(`🗑️ Deleted old sticky message ${sticky.lastMessageId}`);
      } catch (error) {
        console.log('⚠️ Could not delete old sticky message');
      }
    }

    // Send new sticky message
    const stickyMsg = await channel.send(message);

    // Update the sticky message in database
    await prisma.stickyMessage.update({
      where: { channelId },
      data: {
        message: message,
        lastMessageId: stickyMsg.id,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Sticky Message Created')
      .setDescription(`Your sticky message has been set up successfully in <#${channelId}>!`)
      .addFields({
        name: 'Message Preview',
        value: message.length > 100 ? message.substring(0, 100) + '...' : message,
      })
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({
      embeds: [successEmbed],
      ephemeral: true,
    });

    console.log(`✅ Sticky message created in ${channelId} by ${interaction.user.username}`);
  } catch (error) {
    console.error('Error in sticky message modal handler:', error);
    await interaction.reply({
      content: '❌ An error occurred while processing your message.',
      ephemeral: true,
    }).catch(() => {});
  }
}

// Prefix command handler
export async function handleStickyPrefixCommand(message: Message, prefix: string) {
  const content = message.content.slice(prefix.length).trim();
  const args = content.split(/\s+/);
  const commandName = args[0].toLowerCase();

  // Check if user is admin
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    const reply = await message.reply('You need administrator permissions to use this command.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  const channel = message.channel as TextChannel;

  try {
    switch (commandName) {
      case 'stick': {
        const stickyMessage = args.slice(1).join(' ');
        if (!stickyMessage) {
          const reply = await message.reply('Please provide a message to stick.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        const existing = await prisma.stickyMessage.findUnique({
          where: { channelId: message.channelId },
        });

        if (existing) {
          const reply = await message.reply('A sticky message already exists in this channel. Use `' + prefix + 'stickremove` first.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        const stickyMsg = await channel.send(stickyMessage);

        await prisma.stickyMessage.create({
          data: {
            guildId: message.guildId!,
            channelId: message.channelId,
            channelName: channel.name,
            message: stickyMessage,
            lastMessageId: stickyMsg.id,
            isActive: true,
            createdBy: message.author.id,
            createdByName: message.author.username,
          },
        });

        const reply = await message.reply('Sticky message created successfully.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        setTimeout(() => message.delete().catch(() => {}), 5000);
        break;
      }

      case 'stickstop': {
        const sticky = await prisma.stickyMessage.findUnique({
          where: { channelId: message.channelId },
        });

        if (!sticky) {
          const reply = await message.reply('There is no sticky message in this channel.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        if (!sticky.isActive) {
          const reply = await message.reply('The sticky message is already stopped.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        await prisma.stickyMessage.update({
          where: { channelId: message.channelId },
          data: { isActive: false },
        });

        const reply = await message.reply('Sticky message has been stopped.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        setTimeout(() => message.delete().catch(() => {}), 5000);
        break;
      }

      case 'stickstart': {
        const sticky = await prisma.stickyMessage.findUnique({
          where: { channelId: message.channelId },
        });

        if (!sticky) {
          const reply = await message.reply('There is no sticky message in this channel.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        if (sticky.isActive) {
          const reply = await message.reply('The sticky message is already active.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        const stickyMsg = await channel.send(sticky.message);

        await prisma.stickyMessage.update({
          where: { channelId: message.channelId },
          data: {
            isActive: true,
            lastMessageId: stickyMsg.id,
          },
        });

        const reply = await message.reply('Sticky message has been restarted.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        setTimeout(() => message.delete().catch(() => {}), 5000);
        break;
      }

      case 'stickremove': {
        const sticky = await prisma.stickyMessage.findUnique({
          where: { channelId: message.channelId },
        });

        if (!sticky) {
          const reply = await message.reply('There is no sticky message in this channel.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        if (sticky.lastMessageId) {
          try {
            const msg = await channel.messages.fetch(sticky.lastMessageId);
            await msg.delete();
          } catch (error) {
            console.log('Could not delete last sticky message');
          }
        }

        await prisma.stickyMessage.delete({
          where: { channelId: message.channelId },
        });

        const reply = await message.reply('Sticky message has been removed.');
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        setTimeout(() => message.delete().catch(() => {}), 5000);
        break;
      }

      case 'getstickies': {
        const stickies = await prisma.stickyMessage.findMany({
          where: { guildId: message.guildId! },
          orderBy: { createdAt: 'desc' },
        });

        if (stickies.length === 0) {
          const reply = await message.reply('There are no sticky messages in this server.');
          setTimeout(() => reply.delete().catch(() => {}), 5000);
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`Sticky Messages in ${message.guild?.name}`)
          .setColor(0x00ff00)
          .setTimestamp();

        const activeStickies = stickies.filter(s => s.isActive);
        const stoppedStickies = stickies.filter(s => !s.isActive);

        if (activeStickies.length > 0) {
          const activeList = activeStickies.map(s => {
            const preview = s.message.length > 50 ? s.message.substring(0, 50) + '...' : s.message;
            return `<#${s.channelId}>\n"${preview}"`;
          }).join('\n\n');
          
          embed.addFields({
            name: `Active Stickies (${activeStickies.length})`,
            value: activeList,
            inline: false,
          });
        }

        if (stoppedStickies.length > 0) {
          const stoppedList = stoppedStickies.map(s => {
            const preview = s.message.length > 50 ? s.message.substring(0, 50) + '...' : s.message;
            return `<#${s.channelId}>\n"${preview}"`;
          }).join('\n\n');
          
          embed.addFields({
            name: `Stopped Stickies (${stoppedStickies.length})`,
            value: stoppedList,
            inline: false,
          });
        }

        const reply = await message.reply({ embeds: [embed] });
        setTimeout(() => reply.delete().catch(() => {}), 30000);
        setTimeout(() => message.delete().catch(() => {}), 30000);
        break;
      }
    }
  } catch (error) {
    console.error('Error handling sticky prefix command:', error);
    const reply = await message.reply('An error occurred while processing the command.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  }
}

// Handler for auto-reposting sticky messages
export async function handleStickyRepost(message: Message) {
  // Don't repost for bot messages (we only want to repost when real users send messages)
  if (message.author.bot) return;
  
  const channelId = message.channelId;
  
  try {
    const sticky = await prisma.stickyMessage.findUnique({
      where: { channelId },
    });

    if (!sticky || !sticky.isActive) return;

    // Don't repost if this message IS the sticky message itself (prevent infinite loop)
    if (sticky.lastMessageId && message.id === sticky.lastMessageId) return;

    const channel = message.channel as TextChannel;

    // Delete old sticky message
    if (sticky.lastMessageId) {
      try {
        const oldMsg = await channel.messages.fetch(sticky.lastMessageId);
        await oldMsg.delete();
        console.log(`🗑️ Deleted old sticky message ${sticky.lastMessageId}`);
      } catch (error) {
        console.log(`⚠️ Could not delete old sticky message ${sticky.lastMessageId}`);
      }
    }

    // Post new sticky message
    const newStickyMsg = await channel.send(sticky.message);
    
    // Update database with new message ID
    await prisma.stickyMessage.update({
      where: { channelId },
      data: { 
        lastMessageId: newStickyMsg.id,
        updatedAt: new Date(),
      },
    });
    
    console.log(`📌 Sticky message reposted in ${channel.name} (new ID: ${newStickyMsg.id})`);
  } catch (error) {
    console.error('❌ Error reposting sticky message:', error);
    
    // Try to recover
    try {
      const sticky = await prisma.stickyMessage.findUnique({
        where: { channelId },
      });
      
      if (sticky && sticky.isActive) {
        const channel = message.channel as TextChannel;
        const newStickyMsg = await channel.send(sticky.message);
        
        await prisma.stickyMessage.update({
          where: { channelId },
          data: { 
            lastMessageId: newStickyMsg.id,
            updatedAt: new Date(),
          },
        });
        
        console.log(`📌 Sticky message recovered and reposted in ${channel.name}`);
      }
    } catch (recoveryError) {
      console.error('❌ Failed to recover sticky message:', recoveryError);
    }
  }
}
