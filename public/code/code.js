const modal = document.querySelector("#donation-modal");
const openButton = document.querySelector("#open-donation");
const closeButton = document.querySelector("#close-donation");
const form = document.querySelector("#donation-form");
const amountInput = document.querySelector("#amount");
const errorMessage = document.querySelector("#donation-error");
const donateButton = document.querySelector("#donate-button");
const statusMessage = document.querySelector("#payment-status");
const presetButtons = [...document.querySelectorAll("[data-amount]")];

function showError(message = "") {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function setStatus(message = "") {
  statusMessage.textContent = message;
  statusMessage.hidden = !message;
}

function selectPreset(value) {
  for (const button of presetButtons) {
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.amount) === Number(value)),
    );
  }
}

openButton.addEventListener("click", () => {
  showError();
  modal.showModal();
  requestAnimationFrame(() => amountInput.focus());
});
closeButton.addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});

for (const button of presetButtons) {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    amountInput.value = button.dataset.amount;
    selectPreset(button.dataset.amount);
    showError();
    amountInput.focus();
  });
}
amountInput.addEventListener("input", () => selectPreset(amountInput.value));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError();
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    showError("Enter a donation amount to continue.");
    amountInput.focus();
    return;
  }
  if (amount < 2) {
    showError("The minimum donation is $2.");
    amountInput.focus();
    return;
  }

  donateButton.disabled = true;
  donateButton.textContent = "Opening secure checkout…";
  try {
    const response = await fetch("/api/code-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.error === "amount_too_low") {
        showError("The minimum donation is $2.");
      } else if (data.error === "checkout_not_configured") {
        showError("Checkout is temporarily unavailable. Please try again shortly.");
      } else {
        showError("Stripe checkout could not start. Please try again.");
      }
      return;
    }
    if (!data.url) throw new Error("checkout_url_missing");
    window.location.assign(data.url);
  } catch {
    showError("Stripe checkout could not start. Please try again.");
  } finally {
    donateButton.disabled = false;
    donateButton.textContent = "Donate & download code";
  }
});

async function resumeAfterCheckout() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  if (params.has("cancelled")) {
    setStatus("Checkout cancelled — no charge was made.");
    history.replaceState({}, "", "/code");
    return;
  }
  if (!sessionId) return;

  setStatus("Confirming your donation…");
  try {
    const response = await fetch(
      `/api/code-verify?session_id=${encodeURIComponent(sessionId)}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.paid || !data.downloadUrl) {
      setStatus("We could not confirm the payment yet. Refresh this page to retry.");
      return;
    }
    setStatus("Payment received — your code download is starting now.");
    history.replaceState({}, "", "/code");
    const link = document.createElement("a");
    link.href = data.downloadUrl;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    setTimeout(() => link.remove(), 1500);
  } catch {
    setStatus("We could not confirm the payment yet. Refresh this page to retry.");
  }
}

resumeAfterCheckout();
