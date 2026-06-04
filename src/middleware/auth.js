const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME || "admin";
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin123";

function dashboardAuth(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard"');
    return res.status(401).json({ success: false, error: { message: "Yêu cầu xác thực dashboard." } });
  }

  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const [username, password] = decoded.split(":");

  if (username !== DASHBOARD_USERNAME || password !== DASHBOARD_PASSWORD) {
    return res.status(403).json({ success: false, error: { message: "Sai tài khoản hoặc mật khẩu." } });
  }

  next();
}

module.exports = dashboardAuth;
