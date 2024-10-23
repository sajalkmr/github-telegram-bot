require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { RateLimiter } = require('limiter');

const app = express();
const port = process.env.PORT || 3000;

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const channelId = process.env.TELEGRAM_CHANNEL_ID;

const githubUsername = process.env.GITHUB_USERNAME;
const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

const limiter = new RateLimiter({ tokensPerInterval: 1, interval: "second" });

async function sendTelegramMessage(channelId, message, options) {
    await limiter.removeTokens(1);
    return bot.sendMessage(channelId, message, options);
}

let lastProcessedTimestamp = null;

app.get('/', (req, res) => {
    res.send('GitHub Activity Bot is running!');
});

async function fetchAndPostGitHubActivities() {
    try {
        let page = 1;
        let allActivities = [];
        let hasMoreActivities = true;

        while (hasMoreActivities) {
            const response = await axios.get(`https://api.github.com/users/${githubUsername}/events`, {
                headers: {
                    Authorization: `token ${githubToken}`,
                    'User-Agent': 'GitHub-Activity-Bot'
                },
                params: {
                    page: page,
                    per_page: 100
                }
            });

            const activities = response.data;
            if (activities.length === 0) {
                hasMoreActivities = false;
            } else {
                allActivities = allActivities.concat(activities);
                page++;
            }

            // Break if fetched 300 events or reached last processed timestamp
            if (allActivities.length >= 300 || (lastProcessedTimestamp && new Date(activities[activities.length - 1].created_at) <= new Date(lastProcessedTimestamp))) {
                hasMoreActivities = false;
            }
        }

        // Filter and sort 
        const newActivities = allActivities
            .filter(activity => !lastProcessedTimestamp || new Date(activity.created_at) > new Date(lastProcessedTimestamp))
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        for (const activity of newActivities) {
            const message = formatGitHubEvent(activity);
            if (message) {
                try {
                    await sendTelegramMessage(channelId, message, { parse_mode: 'Markdown' });
                    // Update lastProcessedTimestamp after successfully sending the message
                    lastProcessedTimestamp = activity.created_at;
                } catch (telegramError) {
                    console.error('Error sending Telegram message:', telegramError.message);
                    if (telegramError.message.includes('Too Many Requests')) {
                        const retryAfter = parseInt(telegramError.response.headers['retry-after'] || '60', 10);
                        console.log(`Telegram rate limit hit. Waiting for ${retryAfter} seconds before retrying.`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    }
                }
            }
        }

        console.log(`Processed ${newActivities.length} new activities`);
    } catch (error) {
        console.error('Error fetching GitHub activities:', {
            message: error.message,
            status: error.response ? error.response.status : 'No response',
            response: error.response ? {
                data: error.response.data,
                headers: error.response.headers,
            } : 'No response',
        });

        if (error.response && error.response.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
            const resetTime = new Date(error.response.headers['x-ratelimit-reset'] * 1000);
            console.log(`GitHub rate limit exceeded. Try again after ${resetTime}`);
        }
    }
}

function formatGitHubEvent(event) {
    const repo = event.repo.name;
    const repoUrl = `https://github.com/${repo}`;
    const createdAt = new Date(event.created_at).toLocaleString();
    const actor = event.actor.login;
    const actorUrl = `https://github.com/${actor}`;

    let message = `[${actor}](${actorUrl}) `;

    switch (event.type) {
        case 'PushEvent':
            const commits = event.payload.commits;
            const branch = event.payload.ref.split('/').pop();
            message += `🔨 Pushed ${commits.length} commit(s) to [${repo}](${repoUrl}/tree/${branch}) at ${createdAt}\n\n`;
            commits.forEach(commit => {
                const shortSha = commit.sha.substring(0, 7);
                message += `- [${shortSha}](${repoUrl}/commit/${commit.sha}): ${commit.message}\n`;
            });
            break;

        case 'CreateEvent':
            const refType = event.payload.ref_type;
            const ref = event.payload.ref;
            message += `✨ Created ${refType} \`${ref}\` in [${repo}](${repoUrl}) at ${createdAt}`;
            if (refType === 'branch') {
                message += `\n[View branch](${repoUrl}/tree/${ref})`;
            }
            break;

        case 'IssuesEvent':
            const action = event.payload.action;
            const issueNumber = event.payload.issue.number;
            const issueTitle = event.payload.issue.title;
            const issueUrl = `${repoUrl}/issues/${issueNumber}`;
            message += `📝 ${action.charAt(0).toUpperCase() + action.slice(1)} issue [#${issueNumber}](${issueUrl}) in [${repo}](${repoUrl}) at ${createdAt}\n` +
                `Title: ${issueTitle}`;
            break;

        case 'PullRequestEvent':
            const prAction = event.payload.action;
            const prNumber = event.payload.pull_request.number;
            const prTitle = event.payload.pull_request.title;
            const prUrl = `${repoUrl}/pull/${prNumber}`;
            message += `🔀 ${prAction.charAt(0).toUpperCase() + prAction.slice(1)} pull request [#${prNumber}](${prUrl}) in [${repo}](${repoUrl}) at ${createdAt}\n` +
                `Title: ${prTitle}`;
            break;

        case 'ForkEvent':
            const forkee = event.payload.forkee.full_name;
            const forkUrl = `https://github.com/${forkee}`;
            message += `🍴 Forked [${repo}](${repoUrl}) to [${forkee}](${forkUrl}) at ${createdAt}`;
            break;

        case 'WatchEvent':
            message += `⭐ Starred [${repo}](${repoUrl}) at ${createdAt}`;
            break;

        default:
            message += `${event.type} in [${repo}](${repoUrl}) at ${createdAt}`;
    }

    return message;
}

// Fetch every 5 minutes
setInterval(async () => {
    await fetchAndPostGitHubActivities();
}, 5 * 60 * 1000);

// Initial fetch
fetchAndPostGitHubActivities();

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});