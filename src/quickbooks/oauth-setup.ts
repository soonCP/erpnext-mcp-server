#!/usr/bin/env node

import "dotenv/config";

/**
 * One-time OAuth 2.0 setup for QuickBooks Online.
 *
 * Usage:
 *   1. Create an app at https://developer.intuit.com
 *   2. Set redirect URI to http://localhost:3847/callback
 *   3. Set QB_CLIENT_ID and QB_CLIENT_SECRET env vars
 *   4. Run: npm run qb:auth
 *   5. Browser opens → sign in → authorize → tokens saved
 */

import http from "http";
import { URL } from "url";
import axios from "axios";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const CLIENT_ID = process.env.QB_CLIENT_ID;
const CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3847/callback";
const PORT = 3847;

const TOKEN_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".quickbooks-tokens.json"
);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: QB_CLIENT_ID and QB_CLIENT_SECRET must be set.");
  console.error("");
  console.error("Steps:");
  console.error("  1. Go to https://developer.intuit.com/app/developer/dashboard");
  console.error("  2. Create an app (or use existing)");
  console.error("  3. Copy Client ID and Client Secret");
  console.error("  4. Set environment variables:");
  console.error("     export QB_CLIENT_ID=your_client_id");
  console.error("     export QB_CLIENT_SECRET=your_client_secret");
  console.error("  5. Make sure redirect URI is set to: http://localhost:3847/callback");
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

console.log("Starting OAuth flow...");
console.log("");
console.log("If your browser doesn't open automatically, visit:");
console.log(authUrl);
console.log("");

// Try to open browser
try {
  const platform = process.platform;
  if (platform === "darwin") {
    execSync(`open "${authUrl}"`);
  } else if (platform === "linux") {
    // Try multiple openers for Linux/WSL
    try {
      execSync(`wslview "${authUrl}" 2>/dev/null || xdg-open "${authUrl}" 2>/dev/null || sensible-browser "${authUrl}" 2>/dev/null`);
    } catch {
      // Silent fail — user can copy URL
    }
  } else if (platform === "win32") {
    execSync(`start "" "${authUrl}"`);
  }
} catch {
  // Silent fail — user can copy URL
}

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");

  if (!code || !realmId) {
    res.writeHead(400);
    res.end("Missing code or realmId. Please try again.");
    return;
  }

  try {
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
    console.log("OAuth successful!");
    console.log(`Company ID (Realm ID): ${realmId}`);
    console.log(`Tokens saved to: ${TOKEN_FILE}`);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>QuickBooks Connected!</h1>
          <p>Tokens have been saved. You can close this window.</p>
          <p>Company ID: <code>${realmId}</code></p>
        </body>
      </html>
    `);

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  } catch (err: any) {
    console.error("Token exchange failed:", err.response?.data || err.message);
    res.writeHead(500);
    res.end("Token exchange failed. Check console for details.");
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for OAuth callback on port ${PORT}...`);
});
