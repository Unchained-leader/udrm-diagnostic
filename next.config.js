/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDFKit needs access to font files on disk
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverComponentsExternalPackages: ["pdfkit"],
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
