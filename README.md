# Cloudflare Worker Shortlink Service

A fast, serverless URL shortener built with Cloudflare Workers, D1 Database, and the Cache API. 

This project provides a robust API to create, manage, and redirect short links. It uses Bearer Token authentication and implements a smart caching strategy to ensure lightning-fast redirects while minimizing database reads.

## Features

- **Serverless Architecture**: Runs on Cloudflare's global edge network.
- **Cloudflare D1**: Uses Cloudflare's native serverless SQL database for persistent storage.
- **Smart Caching**: 
  - Successful redirects (302) are cached for 1 hour.
  - Not Found (404) responses are cached for 30 minutes to mitigate brute-force guessing.
  - Cache is automatically invalidated upon link updates or deletions.
- **Secure**: Protected by a Bearer token environment variable.
- **Custom Aliases**: Support for custom short link keys or auto-generated 8-character hex codes.

## Prerequisites

- [Node.js](https://nodejs.org/) installed
- A [Cloudflare](https://dash.cloudflare.com/) account
- Wrangler CLI (installed via dependencies)

## 1. Initial Setup

First, install the project dependencies:

```bash
npm install
```

Set up your local configuration and environment files:

```bash
# Create local wrangler config from the template
cp wrangler.jsonc.example wrangler.jsonc

# Create local environment variables file
cp .env.example .dev.vars
```

Update your `.dev.vars` file with a secure passkey:
```env
PASSKEY_AUTH=your_super_secret_token_here
```

## 2. Database Setup (Cloudflare D1)

This project requires a Cloudflare D1 database. 

Create a new D1 database using Wrangler:
```bash
npx wrangler d1 create shortlink-db
```

This command will output a `database_id`. Open your `wrangler.jsonc` file and replace `"YOUR_DATABASE_ID_HERE"` with the generated ID.

**Note:** `wrangler.jsonc` is ignored by Git to keep your Database ID private. Never commit your actual `wrangler.jsonc` or `.dev.vars` to version control.

### Run Database Migrations

Apply the database schema (`schema.sql`) to your D1 instance:

**For Local Development:**
```bash
npx wrangler d1 execute shortlink-db --local --file=./schema.sql
```

**For Production:**
```bash
npx wrangler d1 execute shortlink-db --remote --file=./schema.sql
```

## 3. Local Development

Run the worker locally:

```bash
npm run dev
# or 
npx wrangler dev
```
The server will start, typically at `http://localhost:8787`.

## 4. Testing

To run the Vitest test suite, ensuring your API, authentication, and database logic work correctly:

```bash
npm run test
# or
npx vitest
```

## 5. Deployment

Before deploying, you must set your authentication token as a secret in your Cloudflare Worker environment.

Run the following command and enter your secure token when prompted:
```bash
npx wrangler secret put PASSKEY_AUTH
```

Finally, deploy your worker to Cloudflare's global edge:

```bash
npm run deploy
# or
npx wrangler deploy
```

---

## API Documentation

All API management endpoints require an `Authorization` header:
`Authorization: Bearer <your_token>`

### 1. Create a Shortlink
- **Path**: `/api/link`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "url": "https://www.google.com", 
    "key": "google-website" // Optional. If omitted, generates random 8 hex chars.
  }
  ```

### 2. Update a Shortlink
- **Path**: `/api/link/:code`
- **Method**: `PUT`
- **Body**:
  ```json
  {
    "url": "https://www.bing.com"
  }
  ```

### 3. Delete a Shortlink
- **Path**: `/api/link/:code`
- **Method**: `DELETE`

### 4. List Shortlinks
- **Path**: `/api/links?page=0&limit=20`
- **Method**: `GET`
- **Query Params**: `page` (default: 0), `limit` (default: 20)

### 5. Redirect (Public)
- **Path**: `/:code`
- **Method**: `GET`
- **Description**: Redirects to the target URL if found. Does not require authorization.
