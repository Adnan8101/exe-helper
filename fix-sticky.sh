#!/bin/bash
# Fix the sticky messages handler

# Replace the handleStickyRepost function
sed -i '' '564,600s/.*//' src/commands/stickyMessages.ts

# Now insert the corrected function
cat >> src/commands/stickyMessages.ts << 'FUNC'
// Handler for auto-reposting sticky messages
export async function handleStickyRepost(message: Message) {
  const channelId = message.channelId;
  
  try {
    const sticky = await prisma.stickyMessage.findUnique({
      where: { channelId },
    });

    if (!sticky || !sticky.isActive) return;

    // Don't repost if this message IS the sticky message itself (prevent loop)
    if (sticky.lastMessageId && message.id === sticky.lastMessageId) return;
    
    // Don't repost for bot messages (except when we need to repost after user messages)
    if (message.author.bot) return;

    const channel = message.channel as TextChannel;

    // Delete the old sticky message if it exists
    if (sticky.lastMessageId) {
      try {
        const oldMsg = await channel.messages.fetch(sticky.lastMessageId);
        await oldMsg.delete();
      } catch (error) {
        console.log('Could not delete old sticky message');
      }
    }

    // Post new sticky message
    const newStickyMsg = await channel.send(sticky.message);

    // Update database with new message ID
    await prisma.stickyMessage.update({
      where: { channelId },
      data: { lastMessageId: newStickyMsg.id },
    });
    
    console.log(\`✅ Sticky message reposted in ${channel.name}\`);
  } catch (error) {
    console.error('Error reposting sticky message:', error);
  }
}
FUNC

echo "Fixed sticky messages handler"
