module.exports = function botFilter(options = {}) {
    const { allowPaths = ["/health"], blockEmptyUAOn = ["/auth", "/search", "/favorites", "/host-messages"] } = options;
  
    const badUA = [
      "sqlmap",
      "nikto",
      "acunetix",
      "nmap",
      "masscan",
      "dirbuster",
      "gobuster",
      "wpscan",
      "curl/",       // optional (poate bloca integrări legit)
      "python-requests",
    ];
  
    return (req, res, next) => {
      const path = req.path || "";
  
      if (allowPaths.some((p) => path.startsWith(p))) return next();
  
      const ua = (req.headers["user-agent"] || "").toLowerCase();
  
      // empty UA doar pe rute sensibile
      if (!ua && blockEmptyUAOn.some((p) => path.startsWith(p))) {
        return res.status(403).json({ message: "Forbidden" });
      }
  
      if (ua && badUA.some((x) => ua.includes(x))) {
        return res.status(403).json({ message: "Forbidden" });
      }
  
      next();
    };
  };
  