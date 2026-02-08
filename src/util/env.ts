/**
 * Centralized environment variable accessor for the application.
 */
export const ENV = {
  /**
   * Google OAuth refresh token.
   * @returns The refresh token string.
   */
  get refreshToken(): string {
    return Deno.env.get('ANTIGRAVITY_REFRESH_TOKEN') || '';
  },
  /**
   * Google Cloud Project ID.
   * @returns The project ID string.
   */
  get projectId(): string {
    return Deno.env.get('ANTIGRAVITY_PROJECT_ID') || '';
  },
  /**
   * Google OAuth Client ID.
   * @returns The client ID string.
   */
  get clientId(): string {
    return Deno.env.get('ANTIGRAVITY_CLIENT_ID') || '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
  },
  /**
   * Google OAuth Client Secret.
   * @returns The client secret string.
   */
  get clientSecret(): string {
    return Deno.env.get('ANTIGRAVITY_CLIENT_SECRET') || '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';
  },
  /**
   * Server listening port.
   * @returns The port number.
   */
  get port(): number {
    return parseInt(Deno.env.get('PORT') || '8000');
  },
  /**
   * Whether to keep thinking blocks in the response.
   * @returns Boolean indicating if thinking should be kept.
   */
  get keepThinking(): boolean {
    return Deno.env.get('KEEP_THINKING') === 'true';
  },
  /**
   * Default token budget for thinking models.
   * @returns The budget in tokens.
   */
  get defaultThinkingBudget(): number {
    return parseInt(Deno.env.get('THINKING_BUDGET') || '16000');
  },
} as const;
