const loginView = document.querySelector("[data-login-view]");
const workspace = document.querySelector("[data-workspace]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const applicationList = document.querySelector("[data-application-list]");
const detailPane = document.querySelector("[data-detail-pane]");
const listStatus = document.querySelector("[data-list-status]");
const statusFilter = document.querySelector("[data-status-filter]");
const searchInput = document.querySelector("[data-search-input]");
const refreshButton = document.querySelector("[data-refresh-button]");
const logoutButton = document.querySelector("[data-logout-button]");
const settingsButton = document.querySelector("[data-settings-button]");
const settingsPanel = document.querySelector("[data-settings-panel]");
const passwordForm = document.querySelector("[data-password-form]");
const passwordStatus = document.querySelector("[data-password-status]");

const counts = {
  total: document.querySelector("[data-count-total]"),
  new: document.querySelector("[data-count-new]"),
  reviewing: document.querySelector("[data-count-reviewing]"),
  progress: document.querySelector("[data-count-progress]"),
};

const state = {
  applications: [],
  selectedId: null,
  debounceTimer: null,
};

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMailtoHref(item) {
  const email = String(item.email || "").replace(/\s/g, "").replace(/[<>"']/g, "");
  const recipientName = item.name || "";
  const title = item.organization || item.name || "문의";
  const subject = encodeURIComponent(`Winglia 문의 확인 - ${title}`);
  const body = encodeURIComponent(
    `안녕하세요. ${recipientName}님,\n\nWinglia에 남겨주신 문의 확인 후 연락드립니다.\n\n문의 내용:\n${item.message || ""}\n\n감사합니다.`
  );

  return `mailto:${email}?subject=${subject}&body=${body}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.message || "요청 처리에 실패했습니다.");
  }
  return result;
}

function showLogin() {
  loginView.hidden = false;
  workspace.hidden = true;
}

function showWorkspace() {
  loginView.hidden = true;
  workspace.hidden = false;
}

function updateCounts() {
  counts.total.textContent = state.applications.length;
  counts.new.textContent = state.applications.filter((item) => item.status === "new").length;
  counts.reviewing.textContent = state.applications.filter((item) => item.status === "reviewing").length;
  counts.progress.textContent = state.applications.filter((item) => item.status === "in_progress").length;
}

function renderList() {
  updateCounts();

  if (!state.applications.length) {
    applicationList.innerHTML = "";
    listStatus.textContent = "조건에 맞는 신청이 없습니다.";
    detailPane.innerHTML = `
      <div class="empty-detail">
        <h2>신청이 없습니다.</h2>
        <p>필터나 검색어를 바꾸거나, 새 신청이 들어오면 이곳에서 관리할 수 있습니다.</p>
      </div>
    `;
    return;
  }

  listStatus.textContent = `${state.applications.length}건을 표시합니다.`;
  applicationList.innerHTML = state.applications
    .map((item) => {
      const active = item.id === state.selectedId ? " is-active" : "";
      return `
        <button class="application-row${active}" type="button" data-id="${item.id}">
          <div>
            <h2>${escapeHtml(item.organization || item.name)}</h2>
            <div class="row-meta">
              <span>${escapeHtml(item.name)}</span>
              <span>${escapeHtml(item.serviceLabel)}</span>
              <span>${formatDate(item.createdAt)}</span>
            </div>
            <p class="row-message">${escapeHtml(item.message).slice(0, 120)}</p>
          </div>
          <span class="status-badge ${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span>
        </button>
      `;
    })
    .join("");

  if (!state.selectedId || !state.applications.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.applications[0].id;
  }

  renderDetail();
}

function renderDetail() {
  const item = state.applications.find((application) => application.id === state.selectedId);
  if (!item) return;
  const mailtoHref = buildMailtoHref(item);

  detailPane.innerHTML = `
    <div class="detail-content">
      <h2>${escapeHtml(item.organization || item.name)}</h2>
      <div class="detail-meta">
        <div>
          <span>접수일시</span>
          <strong>${formatDate(item.createdAt)}</strong>
        </div>
        <div>
          <span>업무유형</span>
          <strong>${escapeHtml(item.serviceLabel)}</strong>
        </div>
        <div>
          <span>이름</span>
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <div>
          <span>이메일</span>
          <strong><a class="contact-link" href="${escapeHtml(mailtoHref)}">${escapeHtml(item.email)}</a></strong>
        </div>
        <div>
          <span>연락처</span>
          <strong>${escapeHtml(item.phone || "-")}</strong>
        </div>
        <div>
          <span>선호 연락</span>
          <strong>${escapeHtml(item.preferredContact)}</strong>
        </div>
      </div>
      <div class="message-box">${escapeHtml(item.message)}</div>
      <form class="detail-form" data-detail-form>
        <input name="id" type="hidden" value="${item.id}" />
        <label>
          <span>처리 상태</span>
          <select name="status">
            <option value="new" ${item.status === "new" ? "selected" : ""}>신규</option>
            <option value="reviewing" ${item.status === "reviewing" ? "selected" : ""}>검토 중</option>
            <option value="contacted" ${item.status === "contacted" ? "selected" : ""}>연락 완료</option>
            <option value="in_progress" ${item.status === "in_progress" ? "selected" : ""}>진행 중</option>
            <option value="done" ${item.status === "done" ? "selected" : ""}>완료</option>
            <option value="rejected" ${item.status === "rejected" ? "selected" : ""}>보류</option>
          </select>
        </label>
        <label>
          <span>처리 메모</span>
          <textarea name="adminNote" rows="5">${escapeHtml(item.adminNote)}</textarea>
        </label>
        <label>
          <span>다음 액션</span>
          <textarea name="nextAction" rows="3">${escapeHtml(item.nextAction)}</textarea>
        </label>
        <div class="detail-actions">
          <button type="submit">저장</button>
          <span class="save-status" data-save-status>최근 수정 ${formatDate(item.updatedAt)}</span>
        </div>
      </form>
      <div class="danger-zone">
        <div>
          <h3>신청 삭제</h3>
          <p>처리가 끝났거나 잘못 접수된 신청을 목록에서 삭제합니다.</p>
        </div>
        <button class="danger-button" type="button" data-delete-application data-id="${item.id}">삭제</button>
        <span class="save-status" data-delete-status aria-live="polite"></span>
      </div>
    </div>
  `;
}

async function loadApplications() {
  listStatus.textContent = "접수 데이터를 불러오는 중입니다.";
  const params = new URLSearchParams({
    status: statusFilter.value,
    q: searchInput.value.trim(),
  });
  const result = await api(`/api/admin/applications?${params.toString()}`);
  state.applications = result.applications;
  renderList();
}

async function checkSession() {
  try {
    await api("/api/admin/session");
    showWorkspace();
    await loadApplications();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  const formData = new FormData(loginForm);
  button.disabled = true;
  loginStatus.textContent = "";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: formData.get("password") }),
    });
    loginForm.reset();
    showWorkspace();
    await loadApplications();
  } catch (error) {
    loginStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

applicationList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (!row) return;
  state.selectedId = Number(row.dataset.id);
  renderList();
});

detailPane.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-detail-form]");
  if (!form) return;

  event.preventDefault();
  const button = form.querySelector("button");
  const status = form.querySelector("[data-save-status]");
  const formData = new FormData(form);

  button.disabled = true;
  status.className = "save-status";
  status.textContent = "저장 중입니다.";

  try {
    const result = await api("/api/admin/applications", {
      method: "PATCH",
      body: JSON.stringify({
        id: Number(formData.get("id")),
        status: formData.get("status"),
        adminNote: formData.get("adminNote"),
        nextAction: formData.get("nextAction"),
      }),
    });
    state.applications = state.applications.map((item) =>
      item.id === result.application.id ? result.application : item
    );
    status.className = "save-status success";
    status.textContent = "저장되었습니다.";
    renderList();
  } catch (error) {
    status.className = "save-status error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

detailPane.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-application]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const item = state.applications.find((application) => application.id === id);
  if (!item) return;

  const label = item.organization || item.name;
  const confirmed = window.confirm(`${label} 신청을 삭제할까요?\n삭제한 신청은 관리자 목록에서 사라집니다.`);
  if (!confirmed) return;

  const status = detailPane.querySelector("[data-delete-status]");
  button.disabled = true;
  status.className = "save-status";
  status.textContent = "삭제 중입니다.";

  try {
    await api(`/api/admin/applications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    state.applications = state.applications.filter((application) => application.id !== id);
    state.selectedId = state.applications[0]?.id || null;
    renderList();
  } catch (error) {
    status.className = "save-status error";
    status.textContent = error.message;
    button.disabled = false;
  }
});

statusFilter.addEventListener("change", loadApplications);
refreshButton.addEventListener("click", loadApplications);
settingsButton.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

searchInput.addEventListener("input", () => {
  window.clearTimeout(state.debounceTimer);
  state.debounceTimer = window.setTimeout(loadApplications, 260);
});

logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
  showLogin();
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = passwordForm.querySelector("button");
  const formData = new FormData(passwordForm);

  button.disabled = true;
  passwordStatus.className = "save-status";
  passwordStatus.textContent = "변경 중입니다.";

  try {
    const result = await api("/api/admin/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
      }),
    });

    passwordForm.reset();
    passwordStatus.className = "save-status success";
    passwordStatus.textContent = result.message;

    window.setTimeout(() => {
      showLogin();
      passwordStatus.textContent = "";
    }, 900);
  } catch (error) {
    passwordStatus.className = "save-status error";
    passwordStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

checkSession();
