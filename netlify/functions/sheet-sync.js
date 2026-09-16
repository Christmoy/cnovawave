// Relays Netlify Forms submissions into the master "NovaWave - Client Prospect
// Pipeline" Google Sheet, tagged as Source = "Website — Netlify Form", so
// website leads land in the SAME tracker used by the outbound-prospecting
// automation (per SOP-002 — Website Lead Intake).
//
// This does not talk to Google Sheets directly. It forwards to a Google Apps
// Script Web App bound to the sheet (doPost handler), which has permission to
// append rows. See /docs/apps-script-sheet-sync.gs in this repo for that code.
//
// Required environment variables (set in Netlify site settings, not in code):
//   SHEET_WEBHOOK_URL     — the Apps Script Web App /exec URL
//   SHEET_WEBHOOK_SECRET  — shared secret the Apps Script checks, to stop
//                            random internet traffic from writing rows

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sheetUrl = process.env.SHEET_WEBHOOK_URL;
  const sharedSecret = process.env.SHEET_WEBHOOK_SECRET;
  if (!sheetUrl || !sharedSecret) {
    console.error('SHEET_WEBHOOK_URL or SHEET_WEBHOOK_SECRET is not set');
    return { statusCode: 500, body: 'Sheet sync not configured' };
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

  // Skip Netlify's own test pings / spam-flagged submissions so they don't
  // pollute the pipeline sheet.
  if (payload.data && payload.data.ip === '0.0.0.0') {
    return { statusCode: 200, body: 'skipped (test ping)' };
  }

  const row = {
    companyName: fields.company || '',
    contactName: fields.name || '',
    email: fields.email || '',
    servicesInterestedIn: fields.interest || '',
    notes: fields.message ? `[Website inquiry] ${fields.message}` : '[Website inquiry]',
    source: 'Website — Netlify Form',
    formName,
  };

  try {
    const res = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: sharedSecret, row }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('Sheet sync rejected the row', res.status, text);
      return { statusCode: 502, body: `Sheet sync error: ${res.status} ${text}` };
    }
    // Apps Script Web Apps always answer HTTP 200, even on internal errors —
    // the real result lives in the JSON body's "status" field.
    try {
      const parsed = JSON.parse(text);
      if (parsed.status !== 'ok') {
        console.error('Sheet sync reported an error', parsed);
        return { statusCode: 502, body: `Sheet sync error: ${parsed.message || 'unknown'}` };
      }
    } catch (parseErr) {
      console.error('Sheet sync returned non-JSON response', text);
      return { statusCode: 502, body: 'Sheet sync returned an unexpected response' };
    }
  } catch (err) {
    console.error('Failed to reach sheet sync Web App', err);
    return { statusCode: 502, body: 'Failed to reach sheet sync Web App' };
  }

  return { statusCode: 200, body: 'ok' };
};
