(() => {
  const controls = document.getElementById("support-controls");
  const search = document.getElementById("guide-search");
  const topic = document.getElementById("guide-topic");
  const count = document.getElementById("guide-count");
  const empty = document.getElementById("guide-empty");
  const guides = [...document.querySelectorAll(".support-guide")];
  const searchIndex = guides.map((guide) =>
    `${guide.textContent} ${guide.dataset.search}`.toLowerCase()
  );

  function filterGuides() {
    const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    guides.forEach((guide, index) => {
      const topicMatches = topic.value === "all" || guide.dataset.topic === topic.value;
      guide.hidden = !topicMatches || !words.every((word) => searchIndex[index].includes(word));
      if (!guide.hidden) shown += 1;
    });
    empty.hidden = shown !== 0;
    count.textContent = `${shown} of ${guides.length} guides`;
  }

  function resetFilters() {
    search.value = "";
    topic.value = "all";
    filterGuides();
  }

  function revealLinkedGuide() {
    // Compare known anchors as strings so unexpected URL fragments cannot break the guide.
    const target = guides.find((guide) => location.hash === `#${guide.id}`);
    if (target?.hidden) {
      resetFilters();
      target.scrollIntoView();
    }
  }

  controls.hidden = false;
  search.addEventListener("input", filterGuides);
  topic.addEventListener("change", filterGuides);
  document.getElementById("guide-reset").addEventListener("click", () => {
    resetFilters();
    search.focus();
  });
  document.querySelectorAll(".support-start a").forEach((link) => {
    link.addEventListener("click", () => {
      const target = document.getElementById(link.hash.slice(1));
      if (target.hidden) resetFilters();
    });
  });
  window.addEventListener("hashchange", revealLinkedGuide);
  filterGuides();
  revealLinkedGuide();

  const copyStatus = document.getElementById("guide-copy-status");
  document.querySelectorAll("[data-copy-command]").forEach((button) => {
    const code = button.parentElement.querySelector("code");
    let resetLabel;
    button.hidden = false;
    button.addEventListener("click", async () => {
      window.clearTimeout(resetLabel);
      let copied = false;
      try {
        await navigator.clipboard.writeText(code.textContent);
        copied = true;
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      copyStatus.textContent = copied
        ? `Copied ${code.textContent}`
        : "Clipboard access unavailable. Select and copy the command manually.";
      button.textContent = copied ? "Copied" : "Copy manually";
      resetLabel = window.setTimeout(() => { button.textContent = "Copy"; }, 2600);
    });
  });

  const checklist = document.getElementById("application-checklist");
  const checklistCount = document.getElementById("checklist-count");
  const checks = [...checklist.children].map((item) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const text = document.createElement("span");
    checkbox.type = "checkbox";
    text.textContent = item.textContent;
    label.append(checkbox, text);
    item.replaceChildren(label);
    return checkbox;
  });
  function updateChecklist() {
    const finished = checks.filter((checkbox) => checkbox.checked).length;
    checklistCount.textContent = finished === checks.length
      ? "Ready to start your Discord application."
      : `${finished} of ${checks.length} steps checked`;
  }
  checklist.classList.add("is-interactive");
  checklistCount.hidden = false;
  checklist.addEventListener("change", updateChecklist);
  updateChecklist();
})();
