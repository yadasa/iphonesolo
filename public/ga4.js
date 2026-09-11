(() => {
  const CONFIG_URL = "/__/firebase/init.json";
  let lastPage = "";

  function pagePath() {
    return `${location.pathname}${location.hash}`;
  }

  function sendPageView() {
    const page = pagePath();
    if (page === lastPage || typeof window.gtag !== "function") return;
    lastPage = page;
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: `${location.origin}${page}`,
      page_path: page,
    });
  }

  async function start() {
    try {
      const response = await fetch(CONFIG_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const config = await response.json();
      const measurementId =
        typeof config.measurementId === "string" ? config.measurementId.trim() : "";
      if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
        document.documentElement.dataset.ga4Status = "missing-measurement-id";
        return;
      }

      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", measurementId, {
        send_page_view: false,
        transport_type: "beacon",
      });

      const script = document.createElement("script");
      script.async = true;
      script.src =
        "https://www.googletagmanager.com/gtag/js?id=" +
        encodeURIComponent(measurementId);
      script.dataset.iphonesoloGa4 = measurementId;
      document.head.append(script);
      sendPageView();

      for (const method of ["pushState", "replaceState"]) {
        const original = history[method];
        history[method] = function () {
          const result = original.apply(this, arguments);
          queueMicrotask(sendPageView);
          return result;
        };
      }
      window.addEventListener("popstate", sendPageView);
    } catch {
      document.documentElement.dataset.ga4Status = "unavailable";
    }
  }

  start();
})();
