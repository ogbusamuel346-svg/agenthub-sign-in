const primary = '#155EEF';
const navy = '#0C3275';
const ink = '#1A1D20';
const cream = '#FAF7F2';
const muted = '#5F7190';

export type EmailTemplate = { html: string; text: string };

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value: unknown) {
  const url = String(value ?? '').trim();
  return /^https:\/\//i.test(url) ? escapeHtml(url) : '#';
}

function money(amountMinor: unknown) {
  const amount = Number(amountMinor);
  return Number.isFinite(amount) ? `₦${(amount / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not provided';
}

function layout(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  body: string;
  text: string;
  actionLabel?: string;
  actionUrl?: string;
}) : EmailTemplate {
  const action = input.actionLabel && input.actionUrl
    ? `<p style="margin:28px 0 0"><a href="${safeUrl(input.actionUrl)}" style="display:inline-block;background:${primary};border-radius:8px;color:#ffffff;font-weight:700;padding:13px 20px;text-decoration:none">${escapeHtml(input.actionLabel)}</a></p>`
    : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;background:${cream};color:${ink};font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${cream};padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e5eaf2;border-radius:14px;overflow:hidden"><tr><td style="background:${navy};padding:25px 30px"><div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-.4px">SamEduHub</div><div style="color:#BFD4FF;font-size:12px;margin-top:7px">Simple, secure digital services</div></td></tr><tr><td style="padding:34px 30px"><div style="color:${primary};font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</div><h1 style="color:${navy};font-size:27px;line-height:1.2;margin:10px 0 14px">${escapeHtml(input.title)}</h1><p style="color:${muted};font-size:15px;line-height:1.7;margin:0">${escapeHtml(input.intro)}</p>${input.body}${action}</td></tr><tr><td style="border-top:1px solid #edf1f6;padding:20px 30px"><p style="color:#7B8CA8;font-size:12px;line-height:1.6;margin:0">This message was sent by SamEduHub. If you need help, contact ogbu8372@gmail.com.</p><p style="color:#A0AEC0;font-size:11px;margin:8px 0 0">© SamEduHub</p></td></tr></table></td></tr></table></body></html>`;
  return { html, text: input.text };
}

function detailRows(rows: Array<[string, unknown]>) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;background:#F5F8FD;border-radius:10px;padding:4px 14px">${rows.map(([label, value]) => `<tr><td style="border-bottom:1px solid #E5EAF2;color:${muted};font-size:13px;padding:12px 0">${escapeHtml(label)}</td><td align="right" style="border-bottom:1px solid #E5EAF2;color:${navy};font-size:13px;font-weight:700;padding:12px 0">${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

export function walletFundingConfirmation(input: { name: string; amountMinor: number; reference: string; dashboardUrl?: string }) {
  const details = detailRows([['Amount credited', money(input.amountMinor)], ['Reference', input.reference], ['Status', 'Successful']]);
  return layout({
    preheader: 'Your SamEduHub wallet funding was confirmed.',
    eyebrow: 'Wallet funding',
    title: 'Your wallet has been funded',
    intro: `Hello ${input.name}, your payment was verified and the funds are now available in your SamEduHub wallet.`,
    body: details,
    text: `Hello ${input.name},\n\nYour SamEduHub wallet funding was verified and credited.\nAmount: ${money(input.amountMinor)}\nReference: ${input.reference}\nStatus: Successful\n\nOpen your SamEduHub dashboard to review the transaction.`,
    actionLabel: input.dashboardUrl ? 'Open dashboard' : undefined,
    actionUrl: input.dashboardUrl,
  });
}

export function purchaseConfirmation(input: { name: string; service: string; provider: string; amountMinor: number; reference: string; dashboardUrl?: string }) {
  const details = detailRows([['Service', input.service], ['Provider', input.provider], ['Amount', money(input.amountMinor)], ['Reference', input.reference], ['Status', 'Successful']]);
  return layout({
    preheader: `Your ${input.service} purchase was confirmed.`,
    eyebrow: 'Purchase confirmation',
    title: 'Your purchase is confirmed',
    intro: `Hello ${input.name}, your ${input.service} request was confirmed by the platform.`,
    body: details,
    text: `Hello ${input.name},\n\nYour ${input.service} purchase was confirmed.\nProvider: ${input.provider}\nAmount: ${money(input.amountMinor)}\nReference: ${input.reference}\nStatus: Successful\n\nOpen your SamEduHub dashboard to review the transaction and delivery details.`,
    actionLabel: input.dashboardUrl ? 'View transaction' : undefined,
    actionUrl: input.dashboardUrl,
  });
}

export function adminActivityNotification(input: { service: string; provider: string; amountMinor: number; reference: string; customerEmail: string; customerName: string; kind: string }) {
  const details = detailRows([['Event', input.kind], ['Customer', input.customerName], ['Email', input.customerEmail], ['Service', input.service], ['Provider', input.provider], ['Amount', money(input.amountMinor)], ['Reference', input.reference]]);
  return layout({
    preheader: `New SamEduHub ${input.kind}: ${input.reference}.`,
    eyebrow: 'Admin notification',
    title: 'A platform activity was completed',
    intro: 'A customer activity has been confirmed and recorded in SamEduHub.',
    body: details,
    text: `SamEduHub admin notification\n\nEvent: ${input.kind}\nCustomer: ${input.customerName}\nEmail: ${input.customerEmail}\nService: ${input.service}\nProvider: ${input.provider}\nAmount: ${money(input.amountMinor)}\nReference: ${input.reference}`,
  });
}

export function supportComplaintNotification(input: { customerEmail: string; reference: string; message: string }) {
  const body = `<div style="margin-top:24px;border-left:4px solid ${primary};background:#F5F8FD;padding:16px 18px;color:${ink};font-size:14px;line-height:1.7;white-space:pre-wrap">${escapeHtml(input.message)}</div>${detailRows([['Customer email', input.customerEmail], ['Reference', input.reference || 'Not provided']])}`;
  return layout({
    preheader: 'A new SamEduHub support complaint needs attention.',
    eyebrow: 'Support',
    title: 'New customer complaint',
    intro: 'A customer has submitted a complaint through the SamEduHub support form.',
    body,
    text: `New SamEduHub support complaint\n\nCustomer email: ${input.customerEmail}\nReference: ${input.reference || 'Not provided'}\n\nComplaint:\n${input.message}`,
  });
}

export function supportComplaintAcknowledgement(input: { name: string; reference: string }) {
  return layout({
    preheader: 'We received your SamEduHub support complaint.',
    eyebrow: 'Support received',
    title: 'We received your message',
    intro: `Hello ${input.name}, your complaint has been received by the SamEduHub support team.`,
    body: detailRows([['Reference', input.reference || 'Not provided'], ['Next step', 'Support will review your message']]),
    text: `Hello ${input.name},\n\nWe received your SamEduHub support complaint.\nReference: ${input.reference || 'Not provided'}\n\nOur support team will review it and contact you if more information is needed.`,
  });
}

export function signupConfirmationTemplate(actionUrl = '{{ACTION_URL}}') {
  return layout({
    preheader: 'Confirm your SamEduHub email address.',
    eyebrow: 'Account security',
    title: 'Confirm your email address',
    intro: 'Thanks for creating a SamEduHub account. Confirm your email address to secure your account and access your dashboard.',
    body: '<p style="color:#5F7190;font-size:14px;line-height:1.7;margin:22px 0 0">If you did not create this account, you can safely ignore this message.</p>',
    text: 'Thanks for creating a SamEduHub account. Confirm your email address using the link below. If you did not create this account, you can safely ignore this message.',
    actionLabel: 'Confirm email address',
    actionUrl,
  });
}

export function signupWelcomeNotification(input: { name: string }) {
  return layout({
    preheader: 'Your SamEduHub account is verified and ready.',
    eyebrow: 'Account verified',
    title: 'Welcome to SamEduHub',
    intro: `Hello ${input.name}, your email address has been verified successfully. Your SamEduHub account is now ready to use.`,
    body: '<p style="color:#5F7190;font-size:14px;line-height:1.7;margin:22px 0 0">You can now securely access data, airtime, exam pins, electricity payments and your account wallet from the dashboard.</p>',
    text: `Hello ${input.name},\n\nYour SamEduHub email address has been verified successfully. Your account is now ready to use.\n\nYou can now access data, airtime, exam pins, electricity payments and your account wallet from the dashboard.`,
  });
}

export function passwordResetTemplate(actionUrl = '{{ACTION_URL}}') {
  return layout({
    preheader: 'Reset your SamEduHub password securely.',
    eyebrow: 'Account security',
    title: 'Reset your password',
    intro: 'We received a request to reset the password for your SamEduHub account.',
    body: '<p style="color:#5F7190;font-size:14px;line-height:1.7;margin:22px 0 0">This link is time-limited. If you did not request a reset, no changes have been made to your account.</p>',
    text: 'We received a request to reset your SamEduHub password. Use the link below to choose a new password. If you did not request this, no changes have been made to your account.',
    actionLabel: 'Reset password',
    actionUrl,
  });
}
