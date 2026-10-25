// Category service — list + seed defaults
import { prisma } from "../lib/prisma.js";

const DEFAULTS = [
  { name: "Web Development", slug: "web-development" },
  { name: "Mobile Development", slug: "mobile-development" },
  { name: "Design & Creative", slug: "design-creative" },
  { name: "Writing & Translation", slug: "writing-translation" },
  { name: "Marketing", slug: "marketing" },
  { name: "Data & Analytics", slug: "data-analytics" },
  { name: "Video & Animation", slug: "video-animation" },
  { name: "AI & Machine Learning", slug: "ai-ml" },
];

export async function listCategoriesService() {
  let cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
  if (!cats.length) {
    // seed on first call
    await prisma.category.createMany({ data: DEFAULTS });
    cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
  }
  return cats;
}
