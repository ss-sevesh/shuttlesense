import type { NextConfig } from "next";

const config: NextConfig = { devIndicators: false, turbopack: { root: process.cwd() }, outputFileTracingExcludes: { "/*": ["./data/**/*"] },
  async redirects(){return [{source:'/welcome',destination:'/index.html',permanent:false},{source:'/login',destination:'/index.html?screen=login',permanent:false}];}
};
export default config;
