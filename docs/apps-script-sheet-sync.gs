/**
 * Apps Script Web App — appends website leads to the "NovaWave - Client
 * Prospect Pipeline" sheet from the Netlify sheet-sync function.
 *
 * SETUP (one-time, done by Christian in the Google Sheet UI — this requires
 * an interactive Google login/deploy step that can't be scripted remotely):
 *
 *   1. Open the "NovaWave - Client Prospect Pipeline" Google Sheet.
 *   2. Extensions -> Apps Script.
 *   3. Delete any placeholder code in Code.gs and paste this entire file in.
 *   4. Near the top, set SHARED_SECRET to a random string you make up
 *      (e.g. run `openssl rand -hex 20` anywhere, or just mash the keyboard).
 *      Keep a copy of it — it also needs to go into Netlify as
 *      SHEET_WEBHOOK_SECRET.
 *   5. Click Deploy -> New deployment -> type "Web app".
 *        - Description: "Website lead sync"
 *        - Execute as: Me (christian.antoine@... )
 *        - Who has access: Anyone
 *      (It has to be "Anyone" because Netlify's servers call it with no
 *      Google login of their own — that's what SHARED_SECRET is for.)
 *   6. Click Deploy, authorize the permissions Google asks for.
 *   7. Copy the Web app URL it gives you (ends in /exec).
 *   8. In Netlify -> Site settings -> Environment variables, add:
 *        SHEET_WEBHOOK_URL    = <the /exec URL from step 7>
 *        SHEET_WEBHOOK_SECRET = <the secret from step 4>
 *      (Same "All scopes, not marked secret" workaround used for
 *      SLACK_WEBHOOK_URL — this Netlify plan doesn't support the Secret
 *      toggle or Functions-only scoping.)
 *   9. Trigger a Netlify redeploy so the new env vars reach the function.
 *  10. Submit a test lead on the website and confirm a new row appears in
 *      the sheet with Source = "Website — Netlify Form".
 *
 * If you ever need to redeploy after editing this script, use
 * Deploy -> Manage deployments -> edit (pencil) -> New version, so the
 * /exec URL stays the same and you don't have to update Netlify again.
 */

const SHARED_SECRET = 'REPLACE_ME_WITH_A_RANDOM_SECRET';

// Column order must match the sheet exactly (31 columns, as of 2026-09-16).
const COLUMNS = [
  'Prospect ID',
  'Company Name',
  'Contact Name',
  'Contact Title',
  'Email',
  'Phone',
  'LinkedIn URL',
  'Website',
  'Country',
  'Service Area / Region',
  'Source',
  'Industry/Sector',
  'Company Size (Employees)',
  'Revenue Range',
  'Market Size (TAM $M)',
  'Serviceable Market (SAM $M)',
  'Pipeline Stage',
  'Date Added',
  'Last Contact Date',
  'Next Action',
  'Follow-up Date',
  'Services Interested In',
  'Pain Points Identified',
  'Competitors Mentioned',
  'Estimated Deal Value ($)',
  'Estimated Client LTV ($)',
  'Monthly Retainer Potential ($)',
  'Contract Length (Months)',
  'Engagement Score (1-10)',
  'Priority (High/Med/Low)',
  'Notes',
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SHARED_SECRET) {
      return jsonResponse({ status: 'error', message: 'unauthorized' });
    }

    const row = body.row || {};
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const followUp = Utilities.formatDate(
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
    const prospectId = 'NW-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd-HHmmss');

    const values = {
      'Prospect ID': prospectId,
      'Company Name': row.companyName || '',
      'Contact Name': row.contactName || '',
      'Email': row.email || '',
      'Source': row.source || 'Website — Netlify Form',
      'Pipeline Stage': 'Identified',
      'Date Added': today,
      'Next Action': 'Review inquiry and respond',
      'Follow-up Date': followUp,
      'Services Interested In': row.servicesInterestedIn || '',
      'Priority (High/Med/Low)': 'Medium',
      'Notes': row.notes || '',
    };

    const newRow = COLUMNS.map((col) => (col in values ? values[col] : ''));
    sheet.appendRow(newRow);

    return jsonResponse({ status: 'ok', prospectId });
  } catch (err) {
    return jsonResponse({ status: 'error', message: String(err) });
  }
}

function jsonResponse(obj) {
  // Apps Script Web Apps always answer HTTP 200 for doPost (there is no way
  // to set a different status code from here); success/failure is
  // communicated via the "status" field in the JSON body instead. The
  // Netlify function only checks that the HTTP request itself succeeded.
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
