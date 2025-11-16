import { Client, GatewayIntentBits, Events, REST, Routes, Message, PartialMessage, Partials } from 'discord.js';
import { config } from 'dotenv';
import { captureDataCommand } from './commands/captureData';
import { collectProofCommand } from './commands/collectProof';
import { flushProofCommand } from './commands/flushProof';
import { autoVouchCommand, autoVouchDisableCommand } from './commands/autoVouch';
import { autoProofCommand, autoProofDisableCommand } from './commands/autoProof';
import { deleteVouchCommand } from './commands/deleteVouch';
import { deleteProofCommand } from './commands/deleteProof';
import { setPrefixCommand } from './commands/setPrefix';
import * as syncTeamCommand from './commands/syncTeam';
import { connectDatabase, prisma } from './database';
import { isValidVouch, extractImageUrls } from './utils/vouchValidator';
import { 
  loadChannelCache, 
  refreshCacheIfNeeded, 
  isAutoVouchChannel, 
  isAutoProofChannel,
  getBotPrefix,
  addVouchChannel,
  removeVouchChannel,
  addProofChannel,
  removeProofChannel
} from './utils/channelCache';
import { setupTeamSync } from './utils/teamSync';

config();

console.log('🚀 Starting Discord Bot...');
console.log('⚙️  Loading environment variables...');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in .env file');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID is not set in .env file');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env file');
  process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log('🔌 Connecting to database...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // Required to access role members
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
  ],
});

const commands = [
  captureDataCommand.data.toJSON(),
  collectProofCommand.data.toJSON(),
  flushProofCommand.data.toJSON(),
  autoVouchCommand.data.toJSON(),
  autoVouchDisableCommand.data.toJSON(),
  autoProofCommand.data.toJSON(),
  autoProofDisableCommand.data.toJSON(),
  deleteVouchCommand.data.toJSON(),
  deleteProofCommand.data.toJSON(),
  setPrefixCommand.data.toJSON(),
  syncTeamCommand.data.toJSON(),
];

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  
  try {
    console.log('🔄 Registering slash commands...');
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: commands },
    );
    
    console.log('✅ Successfully registered slash commands:');
    commands.forEach(cmd => console.log(`   - /${cmd.name}`));
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

// Setup team sync before bot ready
setupTeamSync(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log('\n' + '='.repeat(50));
  console.log('✅ BOT SUCCESSFULLY LOGGED IN!');
  console.log('='.repeat(50));
  console.log(`👤 Username: ${readyClient.user.tag}`);
  console.log(`🆔 Client ID: ${readyClient.user.id}`);
  console.log(`🌐 Servers: ${readyClient.guilds.cache.size}`);
  console.log(`👥 Users: ${readyClient.users.cache.size}`);
  console.log('='.repeat(50) + '\n');
  
  await registerCommands();
  
  // Load channel cache
  await loadChannelCache();
  
  console.log('\n🎯 Bot is now operational and ready to receive commands!');
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    console.log(`📝 Command received: /${commandName} from ${interaction.user.tag} in ${interaction.guild?.name}`);

    if (commandName === 'capture-data') {
      await captureDataCommand.execute(interaction);
    } else if (commandName === 'collect-proof') {
      await collectProofCommand.execute(interaction);
    } else if (commandName === 'flush-proof') {
      await flushProofCommand.execute(interaction);
    } else if (commandName === 'auto-vouch-add') {
      await autoVouchCommand.execute(interaction);
    } else if (commandName === 'auto-vouch-disable') {
      await autoVouchDisableCommand.execute(interaction);
    } else if (commandName === 'auto-proof-add') {
      await autoProofCommand.execute(interaction);
    } else if (commandName === 'auto-proof-disable') {
      await autoProofDisableCommand.execute(interaction);
    } else if (commandName === 'delete-vouch') {
      await deleteVouchCommand.execute(interaction);
    } else if (commandName === 'delete-proof') {
      await deleteProofCommand.execute(interaction);
    } else if (commandName === 'setprefix') {
      await setPrefixCommand.execute(interaction);
    } else if (commandName === 'synctream') {
      await syncTeamCommand.execute(interaction);
    }
  }
  
  // Handle button interactions
  if (interaction.isButton()) {
    const { customId } = interaction;
    console.log(`🔘 Button clicked: ${customId} by ${interaction.user.tag}`);
    
    // Handle capture-data buttons
    if (customId.startsWith('add_to_db_') || customId.startsWith('cancel_')) {
      const { handleButtonInteraction } = await import('./commands/captureData');
      await handleButtonInteraction(interaction);
    }
    
    // Handle collect-proof buttons
    if (customId.startsWith('push_proof_') || customId.startsWith('cancel_proof_')) {
      const { handleProofButtonInteraction } = await import('./commands/collectProof');
      await handleProofButtonInteraction(interaction);
    }
    
    // Handle flush-proof buttons
    if (customId.startsWith('confirm_flush_') || customId.startsWith('cancel_flush_')) {
      const { handleFlushButtonInteraction } = await import('./commands/flushProof');
      await handleFlushButtonInteraction(interaction);
    }
  }
});

// Message event listener for auto-vouch and auto-proof
client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Ignore DMs
  if (!message.guild) return;
  
  try {
    // Refresh cache periodically
    await refreshCacheIfNeeded();
    
    // Check if message is a reply with delete command
    if (message.reference?.messageId) {
      const content = message.content.trim();
      const prefix = getBotPrefix();
      
      // Check for delete command with configured prefix
      if (content === `${prefix}delete`) {
        const referencedMessageId = message.reference.messageId;
        
        // Check if it's a vouch
        const vouch = await prisma.vouch.findUnique({
          where: { messageId: referencedMessageId },
        });
        
        if (vouch) {
          // Delete the referenced message
          try {
            const referencedMessage = await message.channel.messages.fetch(referencedMessageId);
            await referencedMessage.delete();
          } catch (error) {
            console.log(`⚠️ Could not delete vouch message ${referencedMessageId}`);
          }
          
          // Delete from database
          await prisma.vouch.delete({
            where: { messageId: referencedMessageId },
          });
          
          // Send confirmation and delete it after 3 seconds
          const confirmMsg = await message.reply('🗑️ Vouch deleted successfully.');
          setTimeout(async () => {
            try {
              await confirmMsg.delete();
              await message.delete();
            } catch (error) {
              console.log('⚠️ Could not delete confirmation messages');
            }
          }, 3000);
          
          console.log(`🗑️ Vouch deleted via reply: ${referencedMessageId}`);
          return;
        }
        
        // Check if it's a proof
        const proof = await prisma.proof.findUnique({
          where: { messageId: referencedMessageId },
        });
        
        if (proof) {
          // Delete the referenced message
          try {
            const referencedMessage = await message.channel.messages.fetch(referencedMessageId);
            await referencedMessage.delete();
          } catch (error) {
            console.log(`⚠️ Could not delete proof message ${referencedMessageId}`);
          }
          
          // Delete from database
          await prisma.proof.delete({
            where: { messageId: referencedMessageId },
          });
          
          // Send confirmation and delete it after 3 seconds
          const confirmMsg = await message.reply('🗑️ Proof deleted successfully.');
          setTimeout(async () => {
            try {
              await confirmMsg.delete();
              await message.delete();
            } catch (error) {
              console.log('⚠️ Could not delete confirmation messages');
            }
          }, 3000);
          
          console.log(`🗑️ Proof deleted via reply: ${referencedMessageId}`);
          return;
        }
      }
    }
    
    // Check if channel is an auto-vouch channel (using cache)
    if (isAutoVouchChannel(message.channelId)) {
      // Validate the vouch
      if (isValidVouch(message)) {
        try {
          // Check if vouch with this messageId already exists
          const existingVouch = await prisma.vouch.findUnique({
            where: { messageId: message.id }
          });
          
          if (existingVouch) {
            // Vouch already exists, update it
            await prisma.vouch.update({
              where: { messageId: message.id },
              data: {
                message: message.content || '',
                attachments: message.attachments.map(att => att.url),
                authorName: message.author.tag,
                authorAvatar: message.author.displayAvatarURL(),
                updatedAt: new Date(),
              },
            });
            console.log(`🔄 Auto-vouch updated: ${message.id} from ${message.author.tag}`);
          } else {
            // Create new vouch - each message ID is unique, one user can have multiple vouches
            let retries = 3;
            let created = false;
            
            while (retries > 0 && !created) {
              try {
                await prisma.vouch.create({
                  data: {
                    channelId: message.channelId,
                    channelName: message.channel.isDMBased() ? 'DM' : (message.channel as any).name,
                    authorId: message.author.id,
                    authorName: message.author.tag,
                    authorAvatar: message.author.displayAvatarURL(),
                    message: message.content || '',
                    messageId: message.id,
                    timestamp: message.createdAt,
                    attachments: message.attachments.map(att => att.url),
                  },
                });
                created = true;
                
                // Send success message and delete after 3 seconds
                const successMsg = await message.reply('✅ Vouch added successfully!');
                setTimeout(async () => {
                  try {
                    await successMsg.delete();
                  } catch (error) {
                    console.log('⚠️ Could not delete success message');
                  }
                }, 3000);
                
                console.log(`✅ Auto-vouch saved: ${message.id} from ${message.author.tag}`);
              } catch (createError: any) {
                if (createError.code === 'P2002') {
                  // Unique constraint violation - check if it's messageId or vouchNumber
                  if (createError.meta?.target?.includes('messageId')) {
                    // MessageId conflict - this message already exists, stop retrying
                    console.log(`⚠️ Vouch with messageId already exists: ${message.id}`);
                    break;
                  } else if (createError.meta?.target?.includes('vouchNumber')) {
                    // VouchNumber conflict - retry after small delay
                    retries--;
                    if (retries > 0) {
                      console.log(`⚠️ VouchNumber conflict, retrying... (${retries} attempts left)`);
                      await new Promise(resolve => setTimeout(resolve, 100));
                    } else {
                      console.error(`❌ Failed to create vouch after retries: ${message.id}`);
                      // Try to fix the sequence
                      await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('"Vouch"', 'vouchNumber'), COALESCE((SELECT MAX("vouchNumber") FROM "Vouch"), 0) + 1, false);`;
                    }
                  }
                } else {
                  console.error('❌ Unexpected error creating vouch:', createError.message);
                  break;
                }
              }
            }
          }
        } catch (error: any) {
          console.error('❌ Error processing vouch:', error.message);
        }
      } else {
        // Invalid vouch - delete and send warning
        try {
          await message.delete();
          if (message.channel.isTextBased() && 'send' in message.channel) {
            const warningMsg = await message.channel.send('⚠️ Only vouches are allowed here. Your message has been removed.');
            setTimeout(async () => {
              try {
                await warningMsg.delete();
              } catch (error) {
                console.log('⚠️ Could not delete warning message');
              }
            }, 3000);
          }
        } catch (error) {
          console.log('⚠️ Could not delete invalid vouch message');
        }
        
        console.log(`❌ Invalid vouch deleted: ${message.id} from ${message.author.tag}`);
      }
      return;
    }
    
    // Check if channel is an auto-proof channel (using cache)
    if (isAutoProofChannel(message.channelId)) {
      const imageUrls = extractImageUrls(message);
      
      if (imageUrls.length > 0) {
        // Extract message ID from content (user should type the vouch message ID)
        const messageIdMatch = message.content.match(/\b\d{17,19}\b/);
        let vouchMessageId: string | null = null;
        
        if (messageIdMatch) {
          vouchMessageId = messageIdMatch[0];
          
          // Try to find the vouch with this message ID
          const vouch = await prisma.vouch.findUnique({
            where: { messageId: vouchMessageId },
          });
          
          if (vouch && imageUrls.length > 0) {
            // Update the vouch with the first proof URL
            await prisma.vouch.update({
              where: { messageId: vouchMessageId },
              data: { proofUrl: imageUrls[0] },
            });
            
            // Send confirmation
            const confirmMsg = await message.reply(`✅ Proof linked to vouch #${vouch.vouchNumber}!`);
            setTimeout(async () => {
              try {
                await confirmMsg.delete();
              } catch (error) {
                console.log('⚠️ Could not delete confirmation message');
              }
            }, 5000);
            
            console.log(`✅ Proof linked to vouch #${vouch.vouchNumber} (${vouchMessageId})`);
          }
        }
        
        try {
          // Check if proof with this messageId already exists
          const existingProof = await prisma.proof.findUnique({
            where: { messageId: message.id }
          });
          
          if (existingProof) {
            // Proof already exists, update it
            await prisma.proof.update({
              where: { messageId: message.id },
              data: {
                message: message.content || '',
                imageUrls: imageUrls,
                authorName: message.author.tag,
                authorAvatar: message.author.displayAvatarURL(),
                updatedAt: new Date(),
              },
            });
            console.log(`🔄 Auto-proof updated: ${message.id} from ${message.author.tag} (${imageUrls.length} images)`);
          } else {
            // Create new proof
            await prisma.proof.create({
              data: {
                channelId: message.channelId,
                channelName: message.channel.isDMBased() ? 'DM' : (message.channel as any).name,
                authorId: message.author.id,
                authorName: message.author.tag,
                authorAvatar: message.author.displayAvatarURL(),
                message: message.content || '',
                messageId: message.id,
                timestamp: message.createdAt,
                imageUrls: imageUrls,
              },
            });
            
            console.log(`✅ Auto-proof saved: ${message.id} from ${message.author.tag} (${imageUrls.length} images)`);
          }
        } catch (error: any) {
          // Handle any unexpected errors
          if (error.code === 'P2002') {
            console.log(`⚠️ Duplicate constraint error for proof: ${message.id}`);
          } else {
            console.error('❌ Error saving proof:', error.message);
          }
        }
      }
      // If no images, just ignore the message
    }
  } catch (error) {
    console.error('❌ Error processing message:', error);
  }
});

// Message update event listener for auto-vouch
client.on(Events.MessageUpdate, async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
  // Fetch full messages if partial
  if (oldMessage.partial) {
    try {
      await oldMessage.fetch();
    } catch (error) {
      console.log('⚠️ Could not fetch old message');
      return;
    }
  }
  
  if (newMessage.partial) {
    try {
      await newMessage.fetch();
    } catch (error) {
      console.log('⚠️ Could not fetch new message');
      return;
    }
  }
  
  const message = newMessage as Message;
  
  // Ignore bot messages
  if (message.author?.bot) return;
  
  // Ignore DMs
  if (!message.guild) return;
  
  try {
    // Check if channel is an auto-vouch channel (using cache)
    if (isAutoVouchChannel(message.channelId)) {
      // Check if this message is in the database
      const existingVouch = await prisma.vouch.findUnique({
        where: { messageId: message.id },
      });
      
      if (existingVouch) {
        // Message was a vouch, check if still valid
        if (isValidVouch(message)) {
          // Update vouch in database
          await prisma.vouch.update({
            where: { messageId: message.id },
            data: {
              message: message.content || '',
              attachments: message.attachments.map(att => att.url),
              updatedAt: new Date(),
            },
          });
          
          console.log(`🔄 Vouch updated: ${message.id}`);
        } else {
          // No longer valid - delete
          try {
            await message.delete();
            if (message.channel.isTextBased() && 'send' in message.channel) {
              const warningMsg = await message.channel.send('⚠️ Edited message is not a valid vouch. Message has been removed.');
              setTimeout(async () => {
                try {
                  await warningMsg.delete();
                } catch (error) {
                  console.log('⚠️ Could not delete warning message');
                }
              }, 3000);
            }
          } catch (error) {
            console.log('⚠️ Could not delete invalid edited vouch');
          }
          
          // Delete from database
          await prisma.vouch.delete({
            where: { messageId: message.id },
          });
          
          console.log(`❌ Invalid edited vouch deleted: ${message.id}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error processing message update:', error);
  }
});

// Message delete event listener
client.on(Events.MessageDelete, async (message: Message | PartialMessage) => {
  // Fetch full message if partial
  if (message.partial) {
    try {
      await message.fetch();
    } catch (error) {
      console.log('⚠️ Could not fetch deleted message');
      // Continue with partial message
    }
  }
  
  try {
    // Check if it's a vouch
    const vouch = await prisma.vouch.findUnique({
      where: { messageId: message.id },
    });
    
    if (vouch) {
      // Delete from database
      await prisma.vouch.delete({
        where: { messageId: message.id },
      });
      
      console.log(`🗑️ Vouch deleted from database (message deleted by user): ${message.id}`);
      return;
    }
    
    // Check if it's a proof
    const proof = await prisma.proof.findUnique({
      where: { messageId: message.id },
    });
    
    if (proof) {
      // Delete from database
      await prisma.proof.delete({
        where: { messageId: message.id },
      });
      
      console.log(`🗑️ Proof deleted from database (message deleted by user): ${message.id}`);
      return;
    }
  } catch (error) {
    console.error('❌ Error processing message deletion:', error);
  }
});

// Initialize database connection first, then login bot
(async () => {
  await connectDatabase();
  
  console.log('\n🤖 Logging in to Discord...');
  await client.login(process.env.DISCORD_TOKEN);
})().catch((error) => {
  console.error('❌ Fatal error during startup:', error);
  process.exit(1);
});
