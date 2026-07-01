const { Expo } = require('expo-server-sdk');

const expo = new Expo();

/**
 * Dispatches a push notification to your mobile device.
 * Supports local mock fallback gracefully.
 */
async function sendPushNotification(title, body, dataPayload = {}) {
  const targetToken = process.env.EXPO_PUSH_TOKEN || 'MOCK_EXPO_PUSH_TOKEN';

  console.log(`[Push Service] Attempting to send alert: "${title}"`);

  if (targetToken === 'MOCK_EXPO_PUSH_TOKEN') {
    console.log(
      `📡 [MOCK PUSH RECEIVED ON DEVICE]: \n🔹 Title: ${title} \n🔹 Body: ${body} \n🔹 Data:`,
      dataPayload,
    );
    return { success: true, status: 'mock_delivered' };
  }

  if (!Expo.isExpoPushToken(targetToken)) {
    console.error(`[Push Service] Target token ${targetToken} is not a valid Expo push token`);
    return { success: false, error: 'Invalid token' };
  }

  const messages = [
    {
      to: targetToken,
      sound: 'default',
      title,
      body,
      data: dataPayload,
      priority: 'high',
    },
  ];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log('[Push Service] Notification batch sent successfully:', tickets);
    }
    return { success: true };
  } catch (error) {
    console.error('[Push Service Error] Failed to route to Expo servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = { sendPushNotification };
