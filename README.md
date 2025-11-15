# Discord Vouch Bot

A TypeScript Discord bot that captures and stores vouch messages from Discord channels into a PostgreSQL database.

## Features

- **`/capture-data`** - Admin-only command to capture all messages from a specified channel
  - Collects author name, profile picture, message content, timestamp, and attachments
  - Displays a comprehensive summary with statistics
  - Temporarily caches data before database push

- **`/push-to-database`** - Admin-only command to push captured data to PostgreSQL
  - Saves all captured messages permanently
  - Prevents duplicate entries
  - Updates capture session records

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Discord Bot Configuration

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Go to "OAuth2" section and copy the Application ID (Client ID)
6. Enable the following Privileged Gateway Intents:
   - Message Content Intent
   - Server Members Intent
7. Generate invite URL with these permissions:
   - `applications.commands` (for slash commands)
   - `bot` with permissions: Read Messages, Send Messages, Read Message History

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_id_here
DATABASE_URL=postgresql://user:password@host:port/database?schema=public
```

### 4. Database Setup

Once you have your Google Cloud PostgreSQL database URL:

```bash
# Generate Prisma Client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

### 5. Run the Bot

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## Database Schema

### Vouch Table
Stores individual vouch messages:
- Channel information
- Author details (ID, name, avatar)
- Message content and ID
- Timestamp
- Attachments

### CaptureSession Table
Tracks capture operations:
- Session metadata
- Total vouches captured
- Initiator information
- Push status and timestamps

## Commands

### `/capture-data channel:[channel]`
- **Permission Required**: Administrator
- **Description**: Captures all messages from the specified channel
- **Process**:
  1. Fetches all messages from channel (oldest to newest)
  2. Collects author info, message content, timestamps, attachments
  3. Creates capture session in database
  4. Shows summary embed with statistics
  5. Caches data for database push

### `/push-to-database`
- **Permission Required**: Administrator
- **Description**: Pushes previously captured data to database
- **Process**:
  1. Retrieves cached capture data
  2. Bulk inserts vouches into database
  3. Updates capture session
  4. Clears cache

## Tech Stack

- **TypeScript** - Type-safe development
- **Discord.js v14** - Discord bot framework
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **dotenv** - Environment configuration

## Project Structure

```
exe-vouchs/
├── src/
│   ├── commands/
│   │   ├── captureData.ts      # Capture data command
│   │   └── pushToDatabase.ts   # Push to database command
│   ├── database.ts              # Prisma client setup
│   └── index.ts                 # Bot entry point
├── prisma/
│   └── schema.prisma            # Database schema
├── .env.example                 # Environment template
├── tsconfig.json                # TypeScript config
└── package.json                 # Project dependencies
```

## Notes

- The bot requires **Administrator** permissions to use commands
- Messages are cached temporarily until pushed to database
- Duplicate messages (by messageId) are automatically skipped
- The bot needs **Message Content Intent** enabled to read message content

## Troubleshooting

If you encounter issues:

1. **Commands not showing**: Wait a few minutes after bot starts, or reinvite bot with correct permissions
2. **Database connection errors**: Verify your DATABASE_URL is correct
3. **Permission errors**: Ensure bot has proper role permissions in your server
4. **Missing messages**: Verify bot has "Read Message History" permission in the channel

## License

ISC
