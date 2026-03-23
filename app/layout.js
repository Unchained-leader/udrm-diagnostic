export const metadata = {
  title: "Unchained AI Coach",
  description: "Your 24/7 AI coaching companion for the Unchained Vices program",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
