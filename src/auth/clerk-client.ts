import { createClerkClient } from "@clerk/clerk-sdk-node";
import type { ClerkClient as ClerkSDKClient } from "@clerk/clerk-sdk-node";

export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  sessionId?: string;
  error?: string;
}

export interface UserMetadata {
  twentyApiKey?: string;
  twentyBaseUrl?: string;
  twentyApiKeyUpdatedAt?: string;
}

export class ClerkClient {
  private clerk: ClerkSDKClient;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.AUTH_ENABLED === "true";

    if (this.enabled) {
      const secretKey = process.env.CLERK_SECRET_KEY;
      const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;

      if (!secretKey) {
        throw new Error("CLERK_SECRET_KEY is required when AUTH_ENABLED=true");
      }

      this.clerk = createClerkClient({
        secretKey,
        publishableKey,
      });
    } else {
      // Create a dummy client for when auth is disabled
      this.clerk = null as any;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    if (!this.enabled) {
      return { valid: false, error: "Authentication is not enabled" };
    }

    try {
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, "");

      // Remote MCP clients (Claude / Cowork) present a Clerk OAuth *access token*,
      // not a Clerk session token, so it has no `sid`. Validate it the OIDC way:
      // call Clerk's userinfo endpoint with the token and read the subject.
      const domain = process.env.CLERK_DOMAIN || "";
      const resp = await fetch(`https://${domain}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${cleanToken}` },
      });

      if (!resp.ok) {
        return {
          valid: false,
          error: `OAuth token rejected by Clerk (${resp.status})`,
        };
      }

      const info: any = await resp.json();
      const oauthUserId = info.sub || info.user_id;

      if (!oauthUserId) {
        return { valid: false, error: "No subject (sub) in userinfo response" };
      }

      return {
        valid: true,
        userId: oauthUserId,
        sessionId: info.sid || "oauth",
      };
    } catch (error) {
      console.error("Token validation error:", error);
      return {
        valid: false,
        error:
          error instanceof Error ? error.message : "Token validation failed",
      };
    }
  }

  async getUserMetadata(userId: string): Promise<UserMetadata | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const user = await this.clerk.users.getUser(userId);
      return (user.privateMetadata as UserMetadata) || {};
    } catch (error) {
      console.error("Failed to get user metadata:", error);
      return null;
    }
  }

  async updateUserMetadata(
    userId: string,
    metadata: UserMetadata,
  ): Promise<void> {
    if (!this.enabled) {
      throw new Error("Authentication is not enabled");
    }

    try {
      await this.clerk.users.updateUser(userId, {
        privateMetadata: metadata as any,
      });
    } catch (error) {
      console.error("Failed to update user metadata:", error);
      throw new Error("Failed to update user configuration");
    }
  }

  getClerkDomain(): string {
    return process.env.CLERK_DOMAIN || "";
  }

  getPublishableKey(): string {
    return process.env.CLERK_PUBLISHABLE_KEY || "";
  }
}
