import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

/** Set with: firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH (same value as the webhook's Authorization header in RevenueCat). */
const webhookAuth = defineSecret('REVENUECAT_WEBHOOK_AUTH');

/** The RevenueCat entitlement id that unlocks premium (must match PREMIUM_ENTITLEMENT in the app). */
const PREMIUM_ENTITLEMENT = 'premium';

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
}

/**
 * RevenueCat → Firestore. The app configures RevenueCat with the Firebase uid as app user id, so
 * `app_user_id` is the document id under /users. Premium is derived from the event's expiry time
 * rather than the event type, which keeps cancellations that still have paid time left active.
 */
export const revenuecatWebhook = onRequest({ secrets: [webhookAuth] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('POST only');
    return;
  }
  if (req.get('Authorization') !== webhookAuth.value()) {
    res.status(401).send('Unauthorized');
    return;
  }

  const event = (req.body?.event ?? null) as RevenueCatEvent | null;
  if (!event?.app_user_id || event.app_user_id.startsWith('$RCAnonymousID')) {
    // Not linked to a Firebase user yet; nothing to write. 200 so RevenueCat doesn't retry.
    res.status(200).send('ignored');
    return;
  }
  if (event.type === 'TEST') {
    res.status(200).send('ok');
    return;
  }

  const grantsPremium = !event.entitlement_ids || event.entitlement_ids.includes(PREMIUM_ENTITLEMENT);
  const expiresMs = event.expiration_at_ms ?? null;
  const active = grantsPremium && (expiresMs === null || expiresMs > Date.now());

  await getFirestore()
    .doc(`users/${event.app_user_id}`)
    .set(
      {
        premium: active,
        premiumExpiresAt: expiresMs ? new Date(expiresMs) : null,
        premiumUpdatedAt: FieldValue.serverTimestamp(),
        lastRevenueCatEvent: event.type,
      },
      { merge: true },
    );
  res.status(200).send('ok');
});
