// Auth.js config for Express — Prisma adapter + Credentials (DB-backed) + Google OAuth + JWT
import "dotenv/config";
import Credentials from "@auth/express/providers/credentials";
import Google from "@auth/express/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";
import type { ExpressAuthConfig } from "@auth/express";
import { prisma } from "./prisma.js";

// Central auth config — imported with ".js" extension by consumers (Vercel)
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export const authConfig: ExpressAuthConfig = {
  adapter: PrismaAdapter(prisma),
  // Credentials requires JWT — database sessions not supported for this provider
  session: { strategy: "jwt" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: `${FRONTEND_URL}/login`,
    error: `${FRONTEND_URL}/auth/error`,
  },
  providers: [
    // Google OAuth — reads AUTH_GOOGLE_ID/SECRET (callback: http://localhost:5000/api/auth/callback/google)
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (user?.password) {
          const ok = await bcrypt.compare(password, user.password);
          if (ok) {
            // Gate credentials sign-in until email verified (Google users are auto-verified)
            if (!user.emailVerified) {
              throw new Error("EMAIL_NOT_VERIFIED");
            }
            return user as unknown as import("@auth/core/types").User;
          }
        }
        return null;
      },
    }),
  ],
  events: {
    // Auto-verify emails for OAuth users (Google emails are pre-verified)
    async createUser({ user }) {
      if (user.email) {
        await prisma.user.update({ where: { id: user.id! }, data: { emailVerified: new Date() } }).catch(() => {});
      }
    },
  },
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      if (user) {
        const u = user as unknown as {
          role?: string;
          id?: string;
          image?: string;
          name?: string;
          email?: string;
          onboardingCompleted?: boolean;
          stripeVerified?: boolean;
          stripePaymentVerified?: boolean;
        };
        (token as unknown as Record<string, unknown>).role =
          u.role ??
          (token as unknown as Record<string, unknown>).role ??
          "client";
        (token as unknown as Record<string, unknown>).id = u.id ?? token.sub;
        if (typeof u.onboardingCompleted === "boolean")
          (token as unknown as Record<string, unknown>).onboardingCompleted = u.onboardingCompleted;
        if (typeof u.stripeVerified === "boolean")
          (token as unknown as Record<string, unknown>).stripeVerified = u.stripeVerified;
        if (typeof u.stripePaymentVerified === "boolean")
          (token as unknown as Record<string, unknown>).stripePaymentVerified = u.stripePaymentVerified;
        // Google provides image via profile.picture or user.image — persist to token
        if (u.image)
          (token as unknown as Record<string, unknown>).picture = u.image;
        if (u.name) (token as unknown as Record<string, unknown>).name = u.name;
        if (u.email)
          (token as unknown as Record<string, unknown>).email = u.email;
        // Also handle profile for OAuth
        if (profile) {
          const p = profile as unknown as { picture?: string; image?: string };
          if (p.picture ?? p.image)
            (token as unknown as Record<string, unknown>).picture =
              p.picture ?? p.image;
        }
      }
      // Always refresh onboardingCompleted + stripeVerified + profile from DB (so completed onboarding/verification is reflected without re-login)
      // Admin is always considered completed
      if (token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: { onboardingCompleted: true, role: true, name: true, image: true, stripeVerified: true, stripePaymentVerified: true, isBanned: true, banReason: true },
          });
          if (dbUser) {
            const isAdmin = dbUser.role === "admin";
            (token as unknown as Record<string, unknown>).onboardingCompleted = isAdmin ? true : dbUser.onboardingCompleted;
            (token as unknown as Record<string, unknown>).stripeVerified = dbUser.stripeVerified;
            (token as unknown as Record<string, unknown>).stripePaymentVerified = dbUser.stripePaymentVerified;
            // Moderation state refreshed live so bans apply without re-login
            (token as unknown as Record<string, unknown>).isBanned = dbUser.isBanned;
            (token as unknown as Record<string, unknown>).banReason = dbUser.banReason;
            // keep name/image in token in sync with DB
            if (dbUser.name) (token as unknown as Record<string, unknown>).name = dbUser.name;
            if (dbUser.image) (token as unknown as Record<string, unknown>).picture = dbUser.image;
            if (dbUser.role) (token as unknown as Record<string, unknown>).role = dbUser.role;
          }
        } catch {}
      }
      // Support trigger: "update" for manual session update after onboarding
      if (trigger === "update") {
        // token already refreshed above
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        const t = token as unknown as Record<string, unknown>;
        (session.user as unknown as Record<string, unknown>).role =
          (t.role as string) ?? "client";
        (session.user as unknown as Record<string, unknown>).id =
          (t.id as string) ?? (token.sub as string) ?? "";
        (session.user as unknown as Record<string, unknown>).onboardingCompleted =
          (t.onboardingCompleted as boolean) ?? (t.role === "admin" ? true : false);
        (session.user as unknown as Record<string, unknown>).stripeVerified =
          (t.stripeVerified as boolean) ?? false;
        (session.user as unknown as Record<string, unknown>).stripePaymentVerified =
          (t.stripePaymentVerified as boolean) ?? false;
        // Moderation state drives the suspended-account UI and the write guard
        (session.user as unknown as Record<string, unknown>).isBanned =
          (t.isBanned as boolean) ?? false;
        (session.user as unknown as Record<string, unknown>).banReason =
          (t.banReason as string | null) ?? null;
        // Google image lives in token.picture (Auth.js maps profile.picture → token.picture)
        const pic = (t.picture as string) ?? (t.image as string);
        if (pic)
          (session.user as unknown as Record<string, unknown>).image = pic;
        if (t.name) session.user.name = t.name as string;
        if (t.email) session.user.email = t.email as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const frontend = FRONTEND_URL;
      if (url.startsWith(frontend)) return url;
      if (url.startsWith("/")) return `${frontend}${url}`;
      if (url === baseUrl || url === `${baseUrl}/`) return frontend;
      // Backend error/signin pages → rewrite to frontend
      if (url.startsWith(baseUrl)) {
        const path = url.slice(baseUrl.length);
        if (path.startsWith("/api/auth/") || path.startsWith("/auth/")) {
          const frontendPath = path.replace(/^\/api\/auth/, "/auth");
          return `${frontend}${frontendPath}`;
        }
        return frontend;
      }
      return frontend;
    },
  },
};
