// Email lib — Resend client + verification email (light-only, Indigo+Amber theme)
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY ?? "");
const FROM = process.env.EMAIL_FROM ?? "TalentHive <onboarding@resend.dev>";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

// Elegant HTML template — light only, indigo primary + amber accent
function verificationHtml(name: string, verifyUrl: string): string {
  const safeName = name.replace(/</g, "&lt;");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
</head><body style="margin:0;padding:0;background:#f6f7f8;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 12px 32px rgba(0,0,0,0.08);">
<tr><td style="padding:32px 32px 0 32px;">
  <table><tr><td style="width:32px;height:32px;background:#4f46e5;border-radius:8px;text-align:center;line-height:32px;color:#fff;font-weight:700;font-size:14px;">TH</td>
  <td style="padding-left:8px;font-weight:700;font-size:14px;letter-spacing:-0.02em;color:#0b0f1e;">TalentHive</td></tr></table>
  <div style="margin-top:16px;display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:0.08em;color:#4f46e5;">VERIFY YOUR EMAIL</div>
  <h1 style="margin:16px 0 8px 0;font-size:22px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#0b0f1e;">Welcome, ${safeName} —<br><span style="font-family:Georgia,serif;font-style:italic;font-weight:400;color:#f59e0b;">confirm</span> your email</h1>
  <p style="margin:0;color:#64748b;font-size:14px;line-height:22px;">Thanks for joining TalentHive. Click below to verify your email and unlock escrow-protected hiring. This link expires in 24 hours.</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;">
  <a href="${verifyUrl}" style="display:block;text-align:center;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:600;font-size:14px;">Verify email address →</a>
  <p style="margin:12px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;">Or copy this link: <br><a href="${verifyUrl}" style="color:#4f46e5;word-break:break-all;">${verifyUrl}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 8px 32px;">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center;">
    <div style="font-size:11px;color:#64748b;line-height:16px;"><strong style="color:#0b0f1e;">Why verify?</strong> Verified emails protect payouts and keep your account secure. Google sign-ins are auto-verified.</div>
  </div>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
  <p style="margin:0;font-size:11px;color:#94a3b8;line-height:16px;">If you didn’t create this account, you can safely ignore this email.<br>© ${new Date().getFullYear()} TalentHive — escrow-protected marketplace</p>
</td></tr>
</table>
<p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;">Need help? Reply to this email.</p>
</td></tr></table>
</body></html>`;
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY missing — skipping send to", to);
    console.log(`[email] verify link: ${FRONTEND_URL}/verify-email?token=${token}`);
    return;
  }
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`;
  const html = verificationHtml(name || (to.split("@")[0] ?? "there"), verifyUrl);
  const { error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject: "Verify your TalentHive email",
    html,
  });
  if (error) {
    console.error("[email] Resend failed:", error);
    throw new Error("Failed to send verification email");
  }
  console.log(`[email] verification sent to ${to}`);
}
