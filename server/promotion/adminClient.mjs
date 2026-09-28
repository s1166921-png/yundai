// Serialized into the admin shell; keep this function self-contained.
export function mountPromotionAdmin(document, environment = window) {
  const $ = selector => document.querySelector(selector);
  const endpoint = "/api/admin/promotions/salespeople";
  let rows = [], editingId = null, latestRequest = 0, imageUrl = null, saving = false, qrRequest = 0;
  const status = message => { $("#status").textContent = message; };
  const setEditorStatus = message => { $("#editor-status").textContent = message; };
  function credentials() {
    const username = $("#username").value.trim(), password = $("#password").value;
    if (!username || !password) throw new Error("请输入管理员账户和密码");
    const bytes = encodeURIComponent(username + ":" + password).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return { Authorization: "Basic " + environment.btoa(bytes) };
  }
  async function request(url, options = {}) {
    const response = await environment.fetch(url, { cache: "no-store", ...options,
      headers: { ...credentials(), ...(options.body ? { "Content-Type": "application/json" } : {}) } });
    if (!response.ok) {
      let message = "请求失败，请稍后重试";
      try { message = (await response.json()).error || message; } catch {}
      const error = new Error(message); error.status = response.status; throw error;
    }
    return response;
  }
  const localTime = value => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "暂无访问";
  function button(text, action, sale) {
    const node = document.createElement("button"); node.type = "button"; node.textContent = text;
    node.dataset.action = action;
    if (["copy", "qr"].includes(action) && !sale.promotionUrl) node.disabled = true;
    node.addEventListener("click", () => perform(action, sale, node)); return node;
  }
  function render() {
    const body = $("#sales-body"); body.replaceChildren();
    rows.forEach(sale => {
      const tr = document.createElement("tr");
      const who = document.createElement("td"), name = document.createElement("strong"), note = document.createElement("small");
      name.textContent = sale.name; note.textContent = sale.internalNote || "未填写备注";
      who.append(name, note); tr.append(who);
      const stateCell = document.createElement("td"), badge = document.createElement("span");
      badge.className = sale.active ? "badge" : "badge paused"; badge.textContent = sale.active ? "推广中" : "已停用";
      stateCell.append(badge); tr.append(stateCell);
      [sale.periodViews ?? 0, sale.totalViews ?? 0, localTime(sale.lastVisitAt)].forEach(value => {
        const td = document.createElement("td"); td.textContent = String(value); tr.append(td);
      });
      const actions = document.createElement("td"); actions.className = "row-actions";
      [["复制链接", "copy"], ["二维码", "qr"], ["编辑", "edit"], [sale.active ? "停用" : "启用", "toggle"]]
        .forEach(([label, action]) => actions.append(button(label, action, sale)));
      tr.append(actions); body.append(tr);
    });
    $("#empty").hidden = rows.length !== 0;
    $("#sales-count").textContent = String(rows.length);
    $("#period-count").textContent = String(rows.reduce((n, row) => n + (row.periodViews || 0), 0));
    $("#total-count").textContent = String(rows.reduce((n, row) => n + (row.totalViews || 0), 0));
  }
  function closeQr() {
    qrRequest += 1;
    $("#qr-panel").hidden = true; $("#qr-image").removeAttribute("src");
    if (imageUrl) environment.URL.revokeObjectURL(imageUrl); imageUrl = null;
    $("#download-qr").removeAttribute("href");
  }
  async function load() {
    const version = ++latestRequest; status("正在读取销售推广数据…");
    try {
      const params = new URLSearchParams();
      for (const key of ["dateFrom", "dateTo"]) if ($("#" + key).value) params.set(key, $("#" + key).value);
      const payload = await (await request(endpoint + "?" + params.toString())).json();
      if (version !== latestRequest) return;
      rows = payload.salespeople;
      $("#configuration").textContent = payload.configurationError || "";
      $("#configuration").hidden = !payload.configurationError;
      render(); status("已更新 · 日期按北京时间统计，访问次数不等于客户人数");
    } catch (error) {
      if (version !== latestRequest) return;
      rows = []; render(); closeQr(); status(error.message);
    }
  }
  function resetEditor() {
    editingId = null; $("#sales-name").value = ""; $("#sales-note").value = "";
    $("#editor-title").textContent = "添加销售"; $("#save-sale").textContent = "添加并生成推广码";
    $("#cancel-edit").hidden = true; setEditorStatus("");
  }
  async function save() {
    if (saving) return;
    closeQr();
    saving = true; $("#save-sale").disabled = true; $("#cancel-edit").disabled = true;
    setEditorStatus("正在保存…");
    try {
      await request(endpoint + (editingId ? "/" + editingId : ""), {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ name: $("#sales-name").value, internalNote: $("#sales-note").value }),
      });
      resetEditor(); setEditorStatus("保存成功，可在列表中复制链接或下载二维码"); await load();
    } catch (error) { setEditorStatus(error.message); }
    finally { saving = false; $("#save-sale").disabled = false; $("#cancel-edit").disabled = false; }
  }
  async function perform(action, sale, node) {
    if (saving && action === "edit") return;
    if (action === "edit") {
      editingId = sale.id; $("#sales-name").value = sale.name; $("#sales-note").value = sale.internalNote;
      $("#editor-title").textContent = "编辑销售"; $("#save-sale").textContent = "保存修改"; $("#cancel-edit").hidden = false;
      setEditorStatus("修改姓名不会改变已分发的二维码"); $("#sales-name").focus(); return;
    }
    if (action === "qr" || action === "toggle") closeQr();
    const qrVersion = qrRequest;
    node.disabled = true;
    try {
      if (action === "toggle") {
        await request(endpoint + "/" + sale.id, { method: "PATCH", body: JSON.stringify({ active: !sale.active }) });
        closeQr(); await load();
      } else if (action === "copy") {
        $("#copy-link").value = sale.promotionUrl; $("#copy-area").hidden = false;
        try {
          if (!environment.navigator.clipboard?.writeText) throw new Error("unavailable");
          await environment.navigator.clipboard.writeText(sale.promotionUrl); status("推广链接已复制");
        } catch {
          $("#copy-link").focus(); if ($("#copy-link").select) $("#copy-link").select();
          status("浏览器无法自动复制，请选中下方链接手动复制");
        }
      } else if (action === "qr") {
        const response = await request(endpoint + "/" + sale.id + "/qr.png");
        const blob = await response.blob();
        if (qrVersion !== qrRequest) return;
        imageUrl = environment.URL.createObjectURL(blob);
        $("#qr-image").src = imageUrl; $("#qr-title").textContent = sale.name + " · 专属二维码";
        $("#qr-link").textContent = sale.promotionUrl;
        $("#qr-state").textContent = sale.active ? "扫码进入云贷网站，访问来源归于该销售。" : "该销售已停用：链接仍可打开网站，但不再计入访问统计。";
        $("#download-qr").href = imageUrl; $("#download-qr").download = "sales-" + sale.id + ".png";
        $("#qr-panel").hidden = false; status("二维码已生成，可以下载 PNG");
      }
    } catch (error) { if (action !== "qr" || qrVersion === qrRequest) status(error.message); }
    finally { node.disabled = false; }
  }
  $("#load").addEventListener("click", load);
  $("#sales-form").addEventListener("submit", event => { event.preventDefault(); save(); });
  $("#cancel-edit").addEventListener("click", resetEditor);
  $("#close-qr").addEventListener("click", closeQr);
  $("#clear-dates").addEventListener("click", () => { $("#dateFrom").value = ""; $("#dateTo").value = ""; load(); });
  for (const id of ["username", "password"]) $("#" + id).addEventListener("input", () => {
    latestRequest += 1; rows = []; render(); closeQr(); $("#copy-area").hidden = true;
    status("账户信息已修改，请重新读取数据");
  });
  return { load, save, resetEditor };
}
