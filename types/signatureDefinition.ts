import masto from "masto";

export interface SignatureDefinition {
  check: (status: masto.mastodon.streaming.UpdateEvent['payload']) => SignatureResponse;
  signatureName: string;
}

export interface SignatureResponse {
  isSpam: boolean;
  reason?: string;
  actions: {
    sendReport?: boolean;
    limitAccount?: boolean;
    suspendAccount?: boolean;
  }
}