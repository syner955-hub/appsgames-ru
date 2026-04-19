import { defineCollection, z, reference } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(10).max(70),
      description: z.string().min(80).max(180),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      category: z.enum(['ios', 'android', 'obzory', 'bezopasnost', 'sovety']),
      tags: z.array(z.string()).default([]),
      hero: image().optional(),
      heroAlt: z.string().optional(),
      author: reference('authors').default('editorial'),
      draft: z.boolean().default(false),
      toc: z.boolean().default(true),
      platforms: z.array(z.enum(['ios', 'android', 'web'])).default([]),
    }),
});

const authors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/authors' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      bio: z.string(),
      avatar: image().optional(),
      url: z.string().url().optional(),
    }),
});

export const collections = { posts, authors };
