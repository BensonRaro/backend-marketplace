// UploadThing FileRouter — Express adapter (light-only, Indigo+Amber marketplace)
// Docs: https://docs.uploadthing.com/backend-adapters/express
import { createUploadthing, type FileRouter } from "uploadthing/express";
import { UploadThingError } from "uploadthing/server";
import { getSession } from "@auth/express";
import { authConfig } from "./auth.js";

const f = createUploadthing();

// Auth middleware — requires valid session (Express req), returns userId for metadata
async function requireUser({ req }: { req: unknown }) {
  const session = await getSession(
    req as import("express").Request,
    authConfig,
  );
  if (!session?.user) throw new UploadThingError("Unauthorized");
  // Suspended accounts cannot upload (uploads are mounted before the global write guard)
  const banned = (session.user as unknown as { isBanned?: boolean }).isBanned;
  if (banned) throw new UploadThingError("Account suspended");
  const userId = (session.user as unknown as { id: string }).id;
  return { userId, email: session.user.email ?? "" };
}

export const uploadRouter = {
  // Avatar — 1 image, 2MB — used for profile pictures (freelancer/client)
  avatarUploader: f({ image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => requireUser({ req }))
    .onUploadComplete(async ({ file, metadata }) => {
      console.log(
        `[uploadthing] avatar uploaded by ${metadata.userId}: ${file.ufsUrl ?? file.url}`,
      );
      return {
        uploadedBy: metadata.userId,
        url: file.ufsUrl ?? file.url,
        key: file.key,
      };
    }),

  // Portfolio — up to 5 images, 8MB each — freelancer portfolio showcase
  portfolioUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 5 } })
    .middleware(async ({ req }) => requireUser({ req }))
    .onUploadComplete(async ({ file, metadata }) => {
      console.log(
        `[uploadthing] portfolio uploaded by ${metadata.userId}: ${file.ufsUrl ?? file.url}`,
      );
      return {
        uploadedBy: metadata.userId,
        url: file.ufsUrl ?? file.url,
        key: file.key,
      };
    }),

  // Job attachment — documents/images for job postings & proposals
  attachmentUploader: f({
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    pdf: { maxFileSize: "16MB", maxFileCount: 3 },
    text: { maxFileSize: "8MB", maxFileCount: 2 },
  })
    .middleware(async ({ req }) => requireUser({ req }))
    .onUploadComplete(async ({ file, metadata }) => {
      console.log(
        `[uploadthing] attachment uploaded by ${metadata.userId}: ${file.ufsUrl ?? file.url}`,
      );
      return {
        uploadedBy: metadata.userId,
        url: file.ufsUrl ?? file.url,
        key: file.key,
        name: file.name,
      };
    }),

  // Work submission — freelancer deliverables (images, pdfs, zips via blob)
  deliverableUploader: f({
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    pdf: { maxFileSize: "16MB", maxFileCount: 5 },
    blob: { maxFileSize: "32MB", maxFileCount: 3 },
  })
    .middleware(async ({ req }) => requireUser({ req }))
    .onUploadComplete(async ({ file, metadata }) => {
      console.log(
        `[uploadthing] deliverable uploaded by ${metadata.userId}: ${file.ufsUrl ?? file.url}`,
      );
      return {
        uploadedBy: metadata.userId,
        url: file.ufsUrl ?? file.url,
        key: file.key,
        name: file.name,
      };
    }),

  // Chat attachments — images, PDFs, ZIPs shared in contract threads
  messageUploader: f({
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    pdf: { maxFileSize: "16MB", maxFileCount: 3 },
    blob: { maxFileSize: "32MB", maxFileCount: 3 },
  })
    .middleware(async ({ req }) => requireUser({ req }))
    .onUploadComplete(async ({ file, metadata }) => {
      console.log(
        `[uploadthing] chat file uploaded by ${metadata.userId}: ${file.ufsUrl ?? file.url}`,
      );
      return {
        uploadedBy: metadata.userId,
        url: file.ufsUrl ?? file.url,
        key: file.key,
        name: file.name,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof uploadRouter;
