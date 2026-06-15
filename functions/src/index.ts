import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineJsonSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

admin.initializeApp();
const db = admin.firestore();

interface SpendingLimits {
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  excludeIncome: boolean;
  emailAlertsEnabled: boolean;
  alertThresholds: number[];
  alertState?: {
    daily?: Record<string, number[]>;
    monthly?: Record<string, number[]>;
  };
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  allowSelfSignedCertificate?: boolean;
}

const smtpConfig = defineJsonSecret<SmtpConfig>('SMTP_CONFIG');

function getSmtpConfig(isEmulator: boolean): SmtpConfig | null {
  if (!process.env.SMTP_CONFIG) {
    if (isEmulator) {
      return null;
    }

    throw new Error('SMTP_CONFIG is not available to the function runtime.');
  }

  const config = smtpConfig.value();
  const hasValidStrings =
    typeof config.host === 'string' &&
    config.host.trim().length > 0 &&
    typeof config.user === 'string' &&
    config.user.trim().length > 0 &&
    typeof config.pass === 'string' &&
    config.pass.length > 0 &&
    typeof config.from === 'string' &&
    config.from.trim().length > 0;
  const hasValidPort = Number.isInteger(config.port) && config.port > 0 && config.port <= 65535;

  if (!hasValidStrings || !hasValidPort || typeof config.secure !== 'boolean') {
    throw new Error(
      'SMTP_CONFIG must contain host, port, secure, user, pass, and from values.'
    );
  }

  const isLoopbackHost = config.host === '127.0.0.1' || config.host === 'localhost';
  if (config.allowSelfSignedCertificate && (!isEmulator || !isLoopbackHost)) {
    throw new Error(
      'allowSelfSignedCertificate can only be used by the emulator with a loopback SMTP host.'
    );
  }

  return {
    ...config,
    host: config.host.trim(),
    user: config.user.trim(),
    from: config.from.trim(),
  };
}

/**
 * Triggered on creation of an expense.
 * Calculates spending levels and triggers email alerts if user-defined thresholds are crossed.
 */
export const checkSpendingLimits = onDocumentCreated(
  {
    document: 'users/{userId}/expenses/{expenseId}',
    region: 'europe-west1',
    secrets: [smtpConfig],
  },
  async (event) => {
    const userId = event.params.userId;
    const expenseData = event.data?.data();

    if (!expenseData) {
      console.log('No expense data found.');
      return;
    }

    // 1. Fetch user's limits configuration
    const limitsDoc = await db
      .doc(`users/${userId}/settings/spending-limits`)
      .get();

    if (!limitsDoc.exists) {
      console.log(`No spending limits configured for user: ${userId}`);
      return;
    }

    const limits = limitsDoc.data() as SpendingLimits;

    if (!limits.emailAlertsEnabled || !limits.alertThresholds || limits.alertThresholds.length === 0) {
      console.log(`Email alerts are disabled or no thresholds configured for user: ${userId}`);
      return;
    }

    const dailyLimit = limits.dailyLimitCents;
    const monthlyLimit = limits.monthlyLimitCents;

    if (!dailyLimit && !monthlyLimit) {
      console.log('Neither daily nor monthly limits are set.');
      return;
    }

    // 2. Fetch User Profile for Email Details
    let userEmail: string | undefined;
    let displayName = 'User';

    try {
      const userRecord = await admin.auth().getUser(userId);
      userEmail = userRecord.email;
      displayName = userRecord.displayName || 'User';
    } catch (authError) {
      console.warn(`Could not fetch auth user record for: ${userId}, checking profile document...`, authError);
      const profileDoc = await db.doc(`users/${userId}`).get();
      if (profileDoc.exists) {
        const profile = profileDoc.data();
        userEmail = profile?.email;
        displayName = profile?.displayName || 'User';
      }
    }

    if (!userEmail) {
      console.error(`No email address available for user: ${userId}. Aborting alert check.`);
      return;
    }

    // 3. Query all expenses for the current month to calculate daily and monthly totals
    const occurredAt = expenseData.occurredAt ? expenseData.occurredAt.toDate() : new Date();
    const startOfMonth = new Date(occurredAt.getFullYear(), occurredAt.getMonth(), 1);
    const endOfMonth = new Date(occurredAt.getFullYear(), occurredAt.getMonth() + 1, 0, 23, 59, 59, 999);

    const expensesSnapshot = await db
      .collection(`users/${userId}/expenses`)
      .where('occurredAt', '>=', admin.firestore.Timestamp.fromDate(startOfMonth))
      .where('occurredAt', '<=', admin.firestore.Timestamp.fromDate(endOfMonth))
      .get();

    let monthlySpentCents = 0;
    let dailySpentCents = 0;

    // Define daily range matching the day of the current expense
    const startOfDay = new Date(occurredAt.getFullYear(), occurredAt.getMonth(), occurredAt.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(occurredAt.getFullYear(), occurredAt.getMonth(), occurredAt.getDate(), 23, 59, 59, 999);

    expensesSnapshot.forEach((docSnap) => {
      const exp = docSnap.data();
      const expDate = exp.occurredAt ? exp.occurredAt.toDate() : new Date();

      const signedAmount =
        exp.transactionType === 'expense'
          ? exp.amountCents
          : limits.excludeIncome
            ? 0
            : -exp.amountCents;

      monthlySpentCents += signedAmount;

      if (expDate >= startOfDay && expDate <= endOfDay) {
        dailySpentCents += signedAmount;
      }
    });

    // Clean up negative values (which could occur if income exceeds expenses)
    monthlySpentCents = Math.max(monthlySpentCents, 0);
    dailySpentCents = Math.max(dailySpentCents, 0);

    // 4. Track alert states to avoid spamming the user
    const alertState = limits.alertState || {};
    const dailyState = alertState.daily || {};
    const monthlyState = alertState.monthly || {};

    const dayKey = `${occurredAt.getFullYear()}-${String(occurredAt.getMonth() + 1).padStart(2, '0')}-${String(occurredAt.getDate()).padStart(2, '0')}`;
    const monthKey = `${occurredAt.getFullYear()}-${String(occurredAt.getMonth() + 1).padStart(2, '0')}`;

    const sentDailyAlerts = dailyState[dayKey] || [];
    const sentMonthlyAlerts = monthlyState[monthKey] || [];

    const newDailyAlerts: number[] = [];
    const newMonthlyAlerts: number[] = [];

    // Calculate Daily Alert Thresholds
    if (dailyLimit && dailyLimit > 0) {
      const dailyPercent = (dailySpentCents / dailyLimit) * 100;
      limits.alertThresholds.forEach((threshold) => {
        if (dailyPercent >= threshold && !sentDailyAlerts.includes(threshold)) {
          newDailyAlerts.push(threshold);
        }
      });
    }

    // Calculate Monthly Alert Thresholds
    if (monthlyLimit && monthlyLimit > 0) {
      const monthlyPercent = (monthlySpentCents / monthlyLimit) * 100;
      limits.alertThresholds.forEach((threshold) => {
        if (monthlyPercent >= threshold && !sentMonthlyAlerts.includes(threshold)) {
          newMonthlyAlerts.push(threshold);
        }
      });
    }

    // If no new alerts triggered, return early
    if (newDailyAlerts.length === 0 && newMonthlyAlerts.length === 0) {
      console.log('No new spending limit thresholds crossed.');
      return;
    }

    // Prepare the alert state, but persist it only after the email succeeds.
    const updatedDailyState = { ...dailyState, [dayKey]: [...sentDailyAlerts, ...newDailyAlerts] };
    const updatedMonthlyState = { ...monthlyState, [monthKey]: [...sentMonthlyAlerts, ...newMonthlyAlerts] };

    // 5. Build and send the alert email
    const dailyStatus = dailyLimit
      ? {
          spent: dailySpentCents / 100,
          limit: dailyLimit / 100,
          percent: Math.round((dailySpentCents / dailyLimit) * 100),
        }
      : null;

    const monthlyStatus = monthlyLimit
      ? {
          spent: monthlySpentCents / 100,
          limit: monthlyLimit / 100,
          percent: Math.round((monthlySpentCents / monthlyLimit) * 100),
        }
      : null;

    // Determine platform URL
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    const platformUrl = isEmulator
      ? 'http://localhost:4200'
      : `https://${process.env.GCLOUD_PROJECT || 'expense-io'}.web.app`;

    const htmlContent = buildEmailTemplate(displayName, newDailyAlerts, newMonthlyAlerts, dailyStatus, monthlyStatus, platformUrl);

    // local testing dev experience: write email to root folder
    if (isEmulator) {
      try {
        const outputPath = path.join(__dirname, '../../last-sent-email.html');
        fs.writeFileSync(outputPath, htmlContent, 'utf8');
        console.log(`[Emulator] Written simulated email HTML to: ${outputPath}`);
      } catch (writeError) {
        console.error('Failed to write simulated email HTML file', writeError);
      }
    }

    const subject = buildEmailSubject(newDailyAlerts, newMonthlyAlerts);
    const config = getSmtpConfig(isEmulator);

    if (!config) {
      console.log(`[Emulator Log] Email alert would be sent to: ${userEmail}`);
      console.log(`Subject: ${subject}`);
      console.log('Add SMTP_CONFIG to functions/.secret.local to test actual sending.');
    } else {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
        tls: config.allowSelfSignedCertificate
          ? {
              rejectUnauthorized: false,
            }
          : undefined,
      });

      try {
        await transporter.sendMail({
          from: config.from,
          to: userEmail,
          subject,
          html: htmlContent,
        });

        console.log(`Successfully sent email alert to ${userEmail} for threshold crossings.`);
      } catch (mailError) {
        console.error('Error occurred while sending limit alert email:', mailError);
        throw mailError;
      }
    }

    // 6. Record sent alerts only after delivery or emulator simulation succeeds.
    await db.doc(`users/${userId}/settings/spending-limits`).set(
      {
        alertState: {
          daily: updatedDailyState,
          monthly: updatedMonthlyState,
        },
      },
      { merge: true }
    );
  }
);

/**
 * Builds the subject line for the email based on which thresholds were crossed.
 */
function buildEmailSubject(newDaily: number[], newMonthly: number[]): string {
  if (newDaily.length > 0 && newMonthly.length > 0) {
    return `⚠️ Expense.io: Daily & Monthly spending limits threshold crossed!`;
  }
  if (newDaily.length > 0) {
    const highest = Math.max(...newDaily);
    return `⚠️ Expense.io: Reached ${highest}% of your daily spending limit`;
  }
  const highest = Math.max(...newMonthly);
  return `⚠️ Expense.io: Reached ${highest}% of your monthly spending limit`;
}

/**
 * Renders a premium HTML email template styled to match the Expense.io branding.
 */
function buildEmailTemplate(
  displayName: string,
  newDailyAlerts: number[],
  newMonthlyAlerts: number[],
  dailyStatus: { spent: number; limit: number; percent: number } | null,
  monthlyStatus: { spent: number; limit: number; percent: number } | null,
  platformUrl: string
): string {
  // Styles & colors matching the app
  const brandColor = '#0a7c74';
  const brandColorTeal = '#2bb8aa';
  const dangerColor = '#e55c5c';
  const warningColor = '#f59e0b';
  const textColor = '#2c3e50';
  const bgColor = '#f7f9f9';

  function renderProgressBar(percent: number): string {
    const fillColor = percent >= 99 ? dangerColor : percent >= 80 ? warningColor : brandColorTeal;
    return `
      <div style="background-color: #edf1f3; border-radius: 99px; height: 10px; width: 100%; overflow: hidden; margin: 12px 0;">
        <div style="background-color: ${fillColor}; height: 100%; width: ${Math.min(percent, 100)}%; border-radius: 99px;"></div>
      </div>
    `;
  }

  let alertsHtml = '';

  if (newDailyAlerts.length > 0 && dailyStatus) {
    const highestDaily = Math.max(...newDailyAlerts);
    const badgeColor = highestDaily >= 99 ? dangerColor : highestDaily >= 80 ? warningColor : brandColorTeal;
    alertsHtml += `
      <div style="border: 1px solid #edf1f3; border-radius: 16px; padding: 20px; background-color: #ffffff; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: ${brandColor};">Daily Limit Alert</span>
          <span style="background-color: ${badgeColor}22; color: ${badgeColor}; padding: 4px 10px; border-radius: 99px; font-weight: 800; font-size: 12px;">${highestDaily}% Reached</span>
        </div>
        <p style="margin: 0; font-size: 15px; color: ${textColor};">
          You have spent <strong>€${dailyStatus.spent.toFixed(2)}</strong> out of your daily limit of <strong>€${dailyStatus.limit.toFixed(2)}</strong>.
        </p>
        ${renderProgressBar(dailyStatus.percent)}
        <div style="text-align: right; font-size: 13px; font-weight: 700; color: ${textColor};">
          Used: ${dailyStatus.percent}% &middot; Remaining: €${Math.max(dailyStatus.limit - dailyStatus.spent, 0).toFixed(2)}
        </div>
      </div>
    `;
  }

  if (newMonthlyAlerts.length > 0 && monthlyStatus) {
    const highestMonthly = Math.max(...newMonthlyAlerts);
    const badgeColor = highestMonthly >= 99 ? dangerColor : highestMonthly >= 80 ? warningColor : brandColorTeal;
    alertsHtml += `
      <div style="border: 1px solid #edf1f3; border-radius: 16px; padding: 20px; background-color: #ffffff; margin-bottom: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: ${brandColor};">Monthly Limit Alert</span>
          <span style="background-color: ${badgeColor}22; color: ${badgeColor}; padding: 4px 10px; border-radius: 99px; font-weight: 800; font-size: 12px;">${highestMonthly}% Reached</span>
        </div>
        <p style="margin: 0; font-size: 15px; color: ${textColor};">
          You have spent <strong>€${monthlyStatus.spent.toFixed(2)}</strong> out of your monthly limit of <strong>€${monthlyStatus.limit.toFixed(2)}</strong>.
        </p>
        ${renderProgressBar(monthlyStatus.percent)}
        <div style="text-align: right; font-size: 13px; font-weight: 700; color: ${textColor};">
          Used: ${monthlyStatus.percent}% &middot; Remaining: €${Math.max(monthlyStatus.limit - monthlyStatus.spent, 0).toFixed(2)}
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Expense.io Spending Guardrail Notification</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${bgColor}; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border: 1px solid #edf1f3; border-radius: 24px; overflow: hidden; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.04);">
        <!-- Header -->
        <tr>
          <td style="background-color: ${brandColor}; padding: 35px 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Expense<span style="color: ${brandColorTeal};">.io</span></h1>
            <p style="color: #dbebe9; margin: 5px 0 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Spending Guardrail</p>
          </td>
        </tr>
        
        <!-- Content -->
        <tr>
          <td style="padding: 40px 40px 30px 40px;">
            <p style="font-size: 16px; font-weight: 700; color: ${textColor}; margin-top: 0; margin-bottom: 20px;">
              Hi ${displayName},
            </p>
            <p style="font-size: 15px; line-height: 1.5; color: ${textColor}; margin-bottom: 30px;">
              You have set up guardrails to monitor your spending. This is an alert that your transactions have approached or exceeded your thresholds:
            </p>
            
            ${alertsHtml}
            
            <p style="font-size: 14px; line-height: 1.5; color: #7f8c8d; margin-top: 30px; margin-bottom: 30px; text-align: center;">
              Keep tracking your expenses to maintain a healthy budget structure!
            </p>
            
            <div style="text-align: center; margin-bottom: 10px;">
              <a href="${platformUrl}" target="_blank" style="background-color: ${brandColor}; color: #ffffff; padding: 14px 28px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 4px 12px rgba(10, 124, 116, 0.25);">
                Go to platform &rarr;
              </a>
            </div>
          </td>
        </tr>
        
        <!-- Footer -->
        <tr>
          <td style="background-color: #fcfdfe; border-top: 1px solid #edf1f3; padding: 25px 40px; text-align: center; font-size: 12px; color: #95a5a6;">
            <p style="margin: 0 0 5px 0;">This is an automated notification from Expense.io.</p>
            <p style="margin: 0;">You can customize or disable these email alerts anytime in your account Settings.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
