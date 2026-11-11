/*
  Put your real public links in this object.
  Keep Discord bot tokens and private API keys out of this static website.
*/
var LINK_CONFIG = {
  discordInviteUrl: "https://discord.gg/gS5AQm9hzQ",
  botInviteUrl: "https://discord.com/oauth2/authorize?client_id=1568360900648243281&permissions=8&integration_type=0&scope=bot",
  drawCoasterUrl: "" // Add the Roblox game URL when it is available
};

(function () {
  var toast = document.getElementById("site-toast");
  var toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 3200);
  }

  function isUsableUrl(value) {
    return typeof value === "string" && /^https:\/\//i.test(value) && value.indexOf("your-") === -1;
  }

  document.querySelectorAll("[data-config-link]").forEach(function (link) {
    var key = link.getAttribute("data-config-link");
    var value = LINK_CONFIG[key];
    if (isUsableUrl(value)) {
      link.href = value;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.classList.remove("is-unavailable");
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
    } else {
      link.href = "#";
      link.classList.add("is-unavailable");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("aria-label", (link.getAttribute("data-unavailable-label") || link.textContent.trim()) + ". Add the URL to LINK_CONFIG in script.js.");
      link.addEventListener("click", function (event) {
        event.preventDefault();
        showToast("Add your " + key.replace("Url", "").replace(/([A-Z])/g, " $1").toLowerCase() + " in the LINK_CONFIG section at the top of script.js.");
      });
    }
  });

  var menuToggle = document.querySelector(".menu-toggle");
  var navigation = document.getElementById("primary-nav");
  if (menuToggle && navigation) {
    menuToggle.addEventListener("click", function () {
      var willOpen = menuToggle.getAttribute("aria-expanded") !== "true";
      menuToggle.setAttribute("aria-expanded", String(willOpen));
      menuToggle.setAttribute("aria-label", willOpen ? "Close menu" : "Open menu");
      navigation.classList.toggle("is-open", willOpen);
    });
    navigation.querySelectorAll("a").forEach(function (item) {
      item.addEventListener("click", function () {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open menu");
        navigation.classList.remove("is-open");
      });
    });
  }

  var filterButtons = document.querySelectorAll("[data-filter]");
  var projectCards = document.querySelectorAll("[data-category]");
  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var filter = button.getAttribute("data-filter");
      filterButtons.forEach(function (candidate) {
        var active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      projectCards.forEach(function (card) {
        card.hidden = filter !== "all" && card.getAttribute("data-category") !== filter;
      });
    });
  });

  var year = document.getElementById("current-year");
  if (year) year.textContent = new Date().getFullYear();
}());

