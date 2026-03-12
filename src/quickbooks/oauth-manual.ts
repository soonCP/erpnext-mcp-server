#!/usr/bin/env node

/**
 * Manual OAuth 2.0 setup using Intuit's OAuth Playground redirect URI.
 *
 * Usage:
 *   1. Ensure QB_CLIENT_ID and QB_CLIENT_SECRET are in .env
 *   2. Run: npm run qb:auth:manual
 *   3. Open the URL printed in your browser
 *   4. Authorize → you'll be redirected to Intuit's playground page
 *   5. Copy the full redirect URL from your browser's address bar
 *   6. Paste it when prompted
 */

import "dotenv/config";
import readline from "readline";
import axios from "axios";
import fs from "fs";
import path from "path";
import { URL } from "url";

const CLIENT_ID = process.env.QB_CLIENT_ID;
const CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const REDIRECT_URI =
  "https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl";

const TOKEN_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".quickbooks-tokens.json"
);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: QB_CLIENT_ID and QB_CLIENT_SECRET must be set in .env");
  process.exit(1);
}

const scopes = "com.intuit.quickbooks.accounting";

const authUrl =
  `https://appcenter.intuit.com/connect/oauth2?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(scopes)}&` +
  `state=quickbooks-mcp`;

console.log("=== QuickBooks OAuth Setup (Manual) ===");
console.log("");
console.log("1. Open this URL in your browser:");
console.log("");
console.log(authUrl);
console.log("");
console.log("2. Sign in and authorize the app.");
console.log("3. After redirect, copy the FULL URL from your browser address bar.");
console.log("4. Paste it below.");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the redirect URL here: ", async (redirectUrl) => {
  rl.close();

  try {
    const url = new URL(redirectUrl);
    const code = url.searchParams.get("code");
    const realmId = url.searchParams.get("realmId");

    if (!code) {
      console.error("Error: No authorization code found in the URL.");
      process.exit(1);
    }

    if (!realmId) {
      console.error("Error: No realmId (company ID) found in the URL.");
      process.exit(1);
    }

    console.log("");
    console.log(`Authorization code: ${code.slice(0, 10)}...`);
    console.log(`Company ID (Realm ID): ${realmId}`);
    console.log("");
    console.log("Exchanging code for tokens...");

    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });

    const response = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      params.toString(),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
      realm_id: realmId,
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));

    console.log("");
    console.log("Success! Tokens saved to:", TOKEN_FILE);
    console.log("You can now use the QuickBooks MCP server.");
  } catch (err: any) {
    console.error(
      "Error:",
      err.response?.data || err.message
    );
    process.exit(1);
  }
});
