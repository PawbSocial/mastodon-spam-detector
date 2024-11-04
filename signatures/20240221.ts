import masto from "masto";
import { SignatureResponse } from "../types/signatureDefinition";

/**
 * This signature detects a spam pattern where mentions > 2 and
 * content includes https://荒らし.com/ or https://ctkpaarr.org/.
 */
export default function (status: masto.mastodon.streaming.UpdateEvent['payload']): SignatureResponse {
  const mentions = status.mentions.length;

  const isSpam =
    mentions > 2 &&
    (status.content.includes('https://荒らし.com/') || status.content.includes('https://ctkpaarr.org/'));

  const reason = `[Sig:20240221] isSpam = ${isSpam} : mentions: ${mentions} > 2, content includes https://荒らし.com/ or https://ctkpaarr.org/`;
  console.debug(reason);

  return {
    isSpam,
    reason: isSpam ? reason : undefined,
    actions: {
      sendReport: false,
      suspendAccount: true,
    }
  };
}
