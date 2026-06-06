document.documentElement.classList.add("js");

const revealTargets = document.querySelectorAll(".reveal-target");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

revealTargets.forEach((target) => {
  target.classList.add("reveal");
  observer.observe(target);
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href");
    const target = id && document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const applyForm = document.querySelector("[data-apply-form]");

if (applyForm) {
  const status = applyForm.querySelector("[data-form-status]");
  const submitButton = applyForm.querySelector('button[type="submit"]');

  applyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(applyForm);
    const payload = Object.fromEntries(formData.entries());
    payload.consent = formData.has("consent");

    submitButton.disabled = true;
    submitButton.textContent = "전송 중";
    status.className = "form-status";
    status.textContent = "업무 내용을 접수하고 있습니다.";

    try {
      const response = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "신청 저장에 실패했습니다.");
      }

      applyForm.reset();
      status.className = "form-status success";
      status.textContent = result.message || "접수되었습니다. 48시간 안에 가능한 범위와 첫 산출물을 안내드리겠습니다.";
    } catch (error) {
      status.className = "form-status error";
      status.textContent = error.message || "잠시 후 다시 시도해주세요.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "신청 보내기";
    }
  });
}
