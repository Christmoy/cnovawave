// Relays Netlify Forms submissions to Slack as a properly formatted message.
//
// Netlify's own "HTTP POST request" form notification sends a JSON body that
// does NOT match what Slack's Incoming Webhook expects, so pointing Netlify
// directly at a Slack webhook URL silently fails. This function sits in
// between: Netlify posts here, we reformat, then we forward to Slack.
//
// Required environment variable (set in Netlify site settings, not in code):
//   SLACK_WEBHOOK_URL  — the Slack Incoming Webhook URL for #website-leads

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('SLACK_WEBHOOK_URL is not set');
    return { statusCode: 500, body: 'Slack webhook not configured' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    console.error('Failed to parse Netlify form payload', err);
    return { statusCode: 400, body: 'Invalid payload' };
  }

  const fields = payload.human_fields || payload.data || {};
  const formName = payload.form_name || 'contact';
  const siteUrl = payload.site_url || 'https://cnovawave.com';

  const lines = Object.entries(fields)
    .filter(([key]) => key.toLowerCase() !== 'bot-field')
    .map(([key, value]) => `*${key}:* ${value}`)
    .join('\n');

  const slackBody = {
    text: `:mailbox_with_mail: New "${formName}" submission on ${siteUrl}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:mailbox_with_mail: *New website lead* (form: \`${formName}\`)\n\n${lines || 'No fields submitted.'}`,
        },
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackBody),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Slack rejected the message', res.status, text);
      return { statusCode: 502, body: `Slack error: ${res.status} ${text}` };
    }
  } catch (err) {
    console.error('Failed to reach Slack', err);
    return { statusCode: 502, body: 'Failed to reach Slack' };
  }

  return { statusCode: 200, body: 'ok' };
};
