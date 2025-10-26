// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',

  adapter: cloudflare({
    mode: 'directory',
    imageService: "cloudflare"
  }),

  image: {
    domains: ["mintdealsbackend-production.up.railway.app", "res.cloudinary.com"],
  },

  vite: {
    plugins: [tailwindcss()]
  }
});