---
name: opentwitter
description: "Twitter/X data via Clawdi proxy — user profiles, tweet search, user tweets, follower events, deleted tweets, KOL followers, tweet detail, quote tweets, and retweet users."

user-invocable: true
metadata:
  openclaw:
    requires:
      bins:
        - curl
      env:
        - CLAWDI_PROXY_TOKEN
    primaryEnv: CLAWDI_PROXY_TOKEN
    emoji: "\U0001F426"
    install:
      - id: curl
        kind: brew
        formula: curl
        label: curl (HTTP client)
    os:
      - darwin
      - linux
      - win32
  version: 2.0.0
---

# Twitter/X Data Skill

Query Twitter/X data via Clawdi's OpenTwitter proxy. All endpoints are POST with JSON body.

Use Clawdi's OpenTwitter proxy at `https://api.clawdi.ai/proxy/opentwitter`.

## Authentication

All requests require the header:
```
Authorization: Bearer $CLAWDI_PROXY_TOKEN
```

---

## Twitter Operations

### 1. Get Twitter User Info

Get user profile by username.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_user_info" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'
```

### 2. Get Twitter User by ID

Get user profile by numeric ID.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_user_by_id" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "44196397"}'
```

### 3. Get User Tweets

Get recent tweets from a user.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_user_tweets" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "maxResults": 20, "product": "Latest"}'
```

| Parameter         | Type    | Default  | Description                    |
|------------------|---------|----------|--------------------------------|
| `username`       | string  | required | Twitter username (without @)   |
| `maxResults`     | integer | 20       | Max tweets (1-100)             |
| `product`        | string  | "Latest" | "Latest" or "Top"              |
| `includeReplies` | boolean | false    | Include reply tweets           |
| `includeRetweets`| boolean | false    | Include retweets               |

### 4. Search Twitter

Search tweets with various filters.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin", "maxResults": 20, "product": "Top"}'
```

**Search from specific user:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fromUser": "VitalikButerin", "maxResults": 20}'
```

**Search by hashtag:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hashtag": "crypto", "minLikes": 100, "maxResults": 20}'
```

### Twitter Search Parameters

| Parameter         | Type    | Default | Description                         |
|------------------|---------|---------|-------------------------------------|
| `keywords`       | string  | -       | Search keywords                     |
| `fromUser`       | string  | -       | Tweets from specific user           |
| `toUser`         | string  | -       | Tweets to specific user             |
| `mentionUser`    | string  | -       | Tweets mentioning user              |
| `hashtag`        | string  | -       | Filter by hashtag (without #)       |
| `excludeReplies` | boolean | false   | Exclude reply tweets                |
| `excludeRetweets`| boolean | false   | Exclude retweets                    |
| `minLikes`       | integer | 0       | Minimum likes threshold             |
| `minRetweets`    | integer | 0       | Minimum retweets threshold          |
| `minReplies`     | integer | 0       | Minimum replies threshold           |
| `sinceDate`      | string  | -       | Start date (YYYY-MM-DD)             |
| `untilDate`      | string  | -       | End date (YYYY-MM-DD)               |
| `lang`           | string  | -       | Language code (e.g. "en", "zh")     |
| `product`        | string  | "Top"   | "Top" or "Latest"                   |
| `maxResults`     | integer | 20      | Max tweets (1-100)                  |

### 5. Get Follower Events

Get new followers or unfollowers for a user.

```bash
# Get new followers
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_follower_events" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "isFollow": true, "maxResults": 20}'

# Get unfollowers
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_follower_events" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "isFollow": false, "maxResults": 20}'
```

| Parameter    | Type    | Default | Description                              |
|-------------|---------|---------|------------------------------------------|
| `username`  | string  | required| Twitter username (without @)             |
| `isFollow`  | boolean | true    | true=new followers, false=unfollowers    |
| `maxResults`| integer | 20      | Max events (1-100)                       |

### 6. Get Deleted Tweets

Get deleted tweets from a user.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_deleted_tweets" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk", "maxResults": 20}'
```

| Parameter    | Type    | Default | Description                    |
|-------------|---------|---------|--------------------------------|
| `username`  | string  | required| Twitter username (without @)   |
| `maxResults`| integer | 20      | Max tweets (1-100)             |

### 7. Get KOL Followers

Get which KOLs (Key Opinion Leaders) are following a user.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_kol_followers" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'
```

| Parameter   | Type   | Default | Description                    |
|------------|--------|---------|--------------------------------|
| `username` | string | required| Twitter username (without @)   |

### 8. Get Twitter Article by ID

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_article_by_id" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "article_id"}'
```

| Parameter | Type   | Default | Description           |
|-----------|--------|---------|----------------------|
| `id`      | string | required| Twitter article ID   |

### 9. Get Tweet by ID

Get a specific tweet by its ID, including nested reply/quote tweets.

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_tweet_by_id" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"twId": "2030318958512164966"}'
```

| Parameter | Type   | Default | Description                    |
|-----------|--------|---------|--------------------------------|
| `twId`    | string | required| Twitter tweet ID (numeric)     |

**Response includes**: Main tweet data, `replyStatus` (tweet being replied to), `quotedStatus` (tweet being quoted).

### 10. Get Quote Tweets by ID

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_quote_tweets_by_id" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "2030318958512164966", "maxResults": 20}'
```

| Parameter    | Type    | Default | Description                    |
|-------------|---------|---------|--------------------------------|
| `id`        | string  | required| Twitter tweet ID (numeric)     |
| `maxResults`| integer | 20      | Max tweets (1-100)             |

### 11. Get Retweet Users by ID

```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_retweet_users_by_id" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "2030318958512164966"}'
```

| Parameter | Type   | Default | Description                              |
|-----------|--------|---------|------------------------------------------|
| `id`      | string | required| Twitter tweet ID (numeric)               |
| `cursor`  | string | -       | Pagination cursor for next page          |

---

> **Note:** Watch list operations (`twitter_watch`, `twitter_watch_add`, `twitter_watch_delete`) and WebSocket subscriptions are not available through the proxy because it uses a shared upstream token.

## Data Structures

### Twitter User

```json
{
  "userId": "44196397",
  "screenName": "elonmusk",
  "name": "Elon Musk",
  "description": "...",
  "followersCount": 170000000,
  "friendsCount": 500,
  "statusesCount": 30000,
  "verified": true
}
```

### Tweet

```json
{
  "id": "1234567890",
  "text": "Tweet content...",
  "createdAt": "2024-02-20T12:00:00Z",
  "retweetCount": 1000,
  "favoriteCount": 5000,
  "replyCount": 200,
  "userScreenName": "elonmusk",
  "hashtags": ["crypto", "bitcoin"],
  "urls": [{"url": "https://..."}]
}
```

---

## Common Workflows

### Crypto Twitter KOL Tweets
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_user_tweets" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin", "maxResults": 10}'
```

### Trending Crypto Tweets
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin", "minLikes": 1000, "product": "Top", "maxResults": 20}'
```

## Notes

- Rate limits apply; max 100 results per request
- Twitter usernames should not include the @ symbol
- WebSocket real-time subscriptions are not available through the proxy
