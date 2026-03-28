export const metadata = {
  title: "Your Results | Unchained Leader",
  description: "Your personalized Unwanted Desire Root Mapping results",
};

export default function DashboardLayout({ children }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {children}
    </div>
  );
}
