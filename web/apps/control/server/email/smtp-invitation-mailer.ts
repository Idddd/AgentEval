import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import {
  getControlConfig,
  type ControlConfig,
} from "../config/control-config";
import type { ProjectRole } from "../projects/project-service";

export interface ProjectInvitationEmail {
  email: string;
  inviterEmail: string;
  inviterName: string;
  projectName: string;
  role: ProjectRole;
}

export interface InvitationMailer {
  assertConfigured(): void;
  sendProjectInvitation(invitation: ProjectInvitationEmail): Promise<void>;
}

export class SmtpInvitationMailer implements InvitationMailer {
  private transporter: Transporter | undefined;

  constructor(
    private readonly smtp: ControlConfig["smtp"] = getControlConfig().smtp,
    private readonly publicUrl: string | undefined =
      getControlConfig().server.public_url,
  ) {}

  assertConfigured(): void {
    if (!this.smtp.enabled) {
      throw new Error(
        "SMTP invitation delivery is not configured in the Control Plane.",
      );
    }
    if (!this.publicUrl) {
      throw new Error(
        "SMTP invitation delivery requires server.public_url in the Control Plane.",
      );
    }
  }

  async verify(): Promise<void> {
    this.assertConfigured();
    await this.transport().verify();
  }

  async sendProjectInvitation(
    invitation: ProjectInvitationEmail,
  ): Promise<void> {
    this.assertConfigured();
    const loginUrl = this.publicUrl!.replace(/\/$/, "");
    const roleLabel = invitation.role === "admin" ? "Administrator" : "Member";
    const subject = `You are invited to ${invitation.projectName} on TaskLattice`;
    const text = [
      `${invitation.inviterName} (${invitation.inviterEmail}) invited you to join ${invitation.projectName} as ${roleLabel}.`,
      "",
      `Open TaskLattice and sign in with ${invitation.email}:`,
      loginUrl,
      "",
      "The invitation is accepted automatically after TaskLattice verifies the same email address through your configured identity provider.",
    ].join("\n");
    const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f7f7f7;color:#171717;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px">
      <div style="background:#ffffff;border:1px solid #e5e5e5;padding:32px">
        <p style="margin:0 0 12px;color:#6b6b6b;font-size:12px;letter-spacing:.12em;text-transform:uppercase">TaskLattice invitation</p>
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25">Join ${escapeHtml(invitation.projectName)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6">${escapeHtml(invitation.inviterName)} invited you to collaborate as <strong>${roleLabel}</strong>.</p>
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#4c36ff;color:#ffffff;text-decoration:none;padding:12px 18px;font-weight:600">Open TaskLattice</a>
        <p style="margin:24px 0 0;color:#6b6b6b;font-size:13px;line-height:1.6">Sign in with <strong>${escapeHtml(invitation.email)}</strong>. Your invitation is accepted after the configured identity provider verifies that email address.</p>
      </div>
    </div>
  </body>
</html>`;

    try {
      await this.transport().sendMail({
        from: {
          address: this.smtp.from_address,
          name: this.smtp.from_name,
        },
        ...(this.smtp.reply_to ? { replyTo: this.smtp.reply_to } : {}),
        to: invitation.email,
        subject,
        text,
        html,
      });
    } catch (error) {
      throw new Error(
        `SMTP delivery failed: ${
          error instanceof Error ? error.message : "unknown SMTP error"
        }`,
      );
    }
  }

  private transport(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: this.smtp.host,
      port: this.smtp.port,
      secure: this.smtp.secure,
      ...(this.smtp.username
        ? {
            auth: {
              user: this.smtp.username,
              pass: this.smtp.password,
            },
          }
        : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return this.transporter;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]!,
  );
}
