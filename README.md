   # Telegram GitHub Bot

   This bot fetches GitHub activities for a specified user and posts them to a Telegram channel.
   Working example: https://t.me/mygitupdates

## Features

   - Fetches GitHub events for a specified user
   - Posts formatted messages to a Telegram channel
   - Handles rate limiting for both GitHub and Telegram APIs
   - Supports various GitHub event types (Push, Create, Issues, Pull Request, Fork, Watch)

     
   ## Setup

   1. Clone the repository
   2. Install dependencies: `npm install`
   3. Create a `.env` file with the following variables:
      ```
      TELEGRAM_BOT_TOKEN=your_telegram_bot_token
      TELEGRAM_CHANNEL_ID=your_telegram_channel_id
      GITHUB_USERNAME=your_github_username
      GITHUB_PERSONAL_ACCESS_TOKEN=your_github_personal_access_token
      PORT=3000
      ```
   4. Run the bot: `node app.js`

   ## Dependencies

   - express
   - node-telegram-bot-api
   - axios
   - dotenv
   - limiter

     

 ## License
