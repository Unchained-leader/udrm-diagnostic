/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDFKit needs access to font files on disk
  serverExternalPackages: ["pdfkit", "@sparticuz/chromium"],
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "@sparticuz/chromium"],
  },
  // Allow CORS for GoHighLevel embedding
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
