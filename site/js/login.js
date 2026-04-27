document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = e.target.password.value;
  const errorEl = document.getElementById("loginError");
  errorEl.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("site_token", data.token);
    window.location.href = "/mysite/edit.html";
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  }
});
