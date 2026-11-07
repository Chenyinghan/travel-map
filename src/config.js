// Two builds:
//   local editor: npm run dev / npm start — light up places, add trips and photos; data lives in data/
//   static site:  npm run build:site — read-only snapshot of data/, published by npm run deploy
export const STATIC_SITE = import.meta.env.MODE === 'static';

// The static site uses relative paths ('./') so it works at a domain root or under github.io/<repo>/
export const BASE = import.meta.env.BASE_URL;
export const asset = (p) => BASE + p;

// Site title (top bar and browser tab): set in data/site.json, injected at build time
/* global __SITE_TITLE__ */
export const SITE_TITLE = typeof __SITE_TITLE__ === 'string' ? __SITE_TITLE__ : 'My Travel Map';
