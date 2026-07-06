// Find the support@memoryo.dev footer link and fix its href to mailto:
(function () {
  function fixEmailLink() {
    var links = document.querySelectorAll("footer a");
    links.forEach(function (link) {
      if (link.textContent.trim().indexOf("support@memoryo.dev") !== -1) {
        link.href = "mailto:support@memoryo.dev";
      }
    });
  }

  // Run on load and after navigation
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fixEmailLink);
  } else {
    fixEmailLink();
  }

  // Re-run after client-side navigation
  var observer = new MutationObserver(fixEmailLink);
  observer.observe(document.body, { childList: true, subtree: true });
})();
