/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // pptxgenjs references Node modules; we only use it in the browser.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        os: false,
        stream: false,
        zlib: false,
      };
    }
    config.externals = config.externals || [];
    return config;
  },
};
module.exports = nextConfig;
